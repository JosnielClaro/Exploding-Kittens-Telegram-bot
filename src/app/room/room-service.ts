import { Extra, Markup, Telegram } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/typings/markup';
import { Message } from 'telegraf/typings/telegram-types';

import { GameFactory } from '../game/game-factory';
import { UserService } from '../user/user-service';
import { BotAction } from './../bot-action.enum';
import {
  AlterFutureCard,
  AttackCard,
  Card,
  CardDescription,
  CardFactory,
  CardType,
  CatCard,
  DefuseCard,
  ExplodingKittenCard,
  FavorCard,
  OtherPlayerCard,
  SeeFutureCard,
} from './../game/card';
import { GameUtils } from './../game/game-utils';
import { Player } from './player';
import { Room } from './room';

/**
 * Handle room logic
 */
export class RoomService {
  /**
   * Singleton
   */
  private static instance: RoomService = null;

  /**
   * User service
   */
  private userService: UserService = UserService.getInstance();

  /**
   * Online rooms
   */
  private rooms: Record<number, Room> = {};

  /**
   * Telegram instance
   */
  private telegram = new Telegram(process.env.BOT_TOKEN);

  private constructor() {}

  /**
   * Get the instance
   */
  static getInstance(): RoomService {
    if (RoomService.instance == null) {
      RoomService.instance = new RoomService();
    }

    return RoomService.instance;
  }

  /**
   * Host a new game
   * @param id Player id
   * @param mode Mode id
   */
  hostGame(id: number, mode: string): Room {
    let room: Room;

    while (!room) {
      const i = this.getRandomNumber();
      // look for a new room
      if (!this.rooms[i]) {
        this.rooms[i] = new Room(i, GameFactory.getMode(mode));

        // add user to the room
        room = this.joinGame(id, i, true);
      }
    }

    return room;
  }

  /**
   * Generate a random room number
   */
  private getRandomNumber(): number {
    return Math.floor(100000 + Math.random() * 900000);
  }

  /**
   * Gets a room
   * @param code Room code
   */
  private getRoom(code: number): Room {
    return this.rooms[code];
  }

  /**
   * Join a game
   * @param id Player id
   * @param code Room number
   * @param host Define the host
   */
  joinGame(id: number, code: number, host: boolean = false): Room {
    // get room
    const current: number = this.userService.getRoom(id);
    const currentRoom: Room = this.getRoom(current);

    // game ended
    if (currentRoom) {
      return;
    }

    let room: Room = this.getRoom(code);
    if (room && !room.running && room.players.length < room.mode.maxPlayers) {
      // notify players
      this.notifyRoom(
        code,
        'se unió a la sala. [' +
          (room.players.length + 1) +
          '/' +
          room.mode.maxPlayers +
          '] jugadores.',
        id
      );

      // add user
      room.players.push(new Player(id, host));
      this.userService.setRoom(id, code);
    } else {
      room = null;
    }

    return room;
  }

  /**
   * Start the game in a room
   * @param id Player id
   */
  startGame(id: number): boolean {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);
    let running = false;

    if (room && room.players.length > 1) {
      room.running = true;
      running = room.running;

      // prepare deck
      room.deck = GameUtils.shuffle(room.mode.getCards(room.players.length));

      // give cards to each player
      for (const player of room.players) {
        player.cards.push(new DefuseCard());
        for (let i = 0; i < 6; i++) {
          player.cards.push(room.deck.pop());
        }

        player.cards = GameUtils.shuffle(player.cards);
      }

      // add exploding and defuse
      room.deck = GameUtils.shuffle(
        room.deck.concat(room.mode.getMissingCards(room.players.length))
      );

      this.notifyRoom(
        code,
        'El juego ha comenzado. [' +
          room.players.length +
          '/' +
          room.mode.maxPlayers +
          '] jugadores.'
      ).then(() => {
        // send card
        this.sendCards(code).then(() => {
          // start turn
          this.sendNextPlayer(room);
        });
      });
    }

    return running;
  }

  /**
   * Send cards to every player or the specified one
   * @param code Room code
   * @param id Specific user id
   */
  sendCards(code: number, id: number = -1): Promise<Message[]> {
    // get room
    const room: Room = this.getRoom(code);

    const result: Promise<Message>[] = [];
    for (const player of room.players) {
      if (id === player.id || id === -1) {
        let message =
          player.cards.length > 0 ? 'Tienes:\n' : 'No tienes cartas';
        const cards: Record<string, number> = {};
        for (const card of player.cards) {
          if (cards[card.description]) {
            cards[card.description]++;
          } else {
            cards[card.description] = 1;
          }
        }

        for (const card of Object.keys(cards)) {
          message += cards[card] + ' ' + card + '\n';
        }

        result.push(this.telegram.sendMessage(player.id, message));
      }
    }

    return Promise.all(result);
  }

  /**
   * Send cards to let a player play
   * @param code Room code
   */
  private sendCardsButtons(code: number): void {
    // get room
    const room: Room = this.getRoom(code);

    // get active player
    const player: Player = room.players[room.currentPlayer];

    // send cards info
    const buttons: InlineKeyboardButton[][] = this.getCardsButtons(player);

    this.telegram.sendMessage(
      player.id,
      'Elige una carta',
      Markup.inlineKeyboard(buttons).oneTime().extra()
    );
  }

  /**
   * Get player cards as buttons
   * @param player Player cards to get
   * @param draw Add draw button
   * @param data Additional data in the callback
   */
  private getCardsButtons(
    player: Player,
    draw: boolean = true,
    data: string = ''
  ): InlineKeyboardButton[][] {
    const buttons: InlineKeyboardButton[][] = [];

    if (draw) {
      buttons.push([Markup.callbackButton('Robar', BotAction.DRAW)]);
    }

    // group cards by same type
    const rows: Record<string, number> = {};
    let row = buttons.length;
    for (const card of player.cards) {
      if (!rows[card.type]) {
        rows[card.type] = row;
        buttons[row] = [];
        row++;
      }

      // add button to the row of its type
      buttons[rows[card.type]].push(
        Markup.callbackButton(card.description, data + card.type)
      );
    }

    return buttons;
  }

  /**
   * Draw action
   * @param id User id
   * @param top Draw from top
   */
  drawCard(id: number, top: boolean = true): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    // get current player
    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    const card: Card = top ? room.deck.pop() : room.deck.splice(0, 1)[0];
    GameUtils.addRandomPosition(player.cards, card);

    this.telegram
      .sendMessage(player.id, card.description, Extra.markdown().markup(''))
      .then(() => {
        // exploding kittens
        if (card instanceof ExplodingKittenCard) {
          this.notifyRoom(code, 'robó un ' + card.description, id).then(() => {
            // if has defuse ask to play it
            if (player.cards.find((c: Card) => c instanceof DefuseCard)) {
              this.telegram.sendMessage(
                id,
                '¿Quieres desactivar el Exploding Kitten?',
                Markup.inlineKeyboard([
                  Markup.callbackButton('Sí', BotAction.DEFUSE_KITTEN),
                  Markup.callbackButton('No', BotAction.EXPLODE),
                ])
                  .oneTime()
                  .extra()
              );
            } else {
              // else explode
              this.playCard(id, CardType.EXPLODING_KITTEN);
            }
          });
        } else {
          // number of cards
          this.notifyRoom(code, 'robó una carta', id).then(() => {
            // add card to player's deck
            this.sendCards(code, id).then(() => {
              this.nextPlayer(code);
            });
          });
        }
      });
  }

  /**
   * Ask the user to start again
   * @param id User id
   */
  private sendStartSuggestion(id: number): void {
    this.telegram.sendMessage(id, 'Envía /start para comenzar.');
  }

  /**
   * Notify user that it's not his turn
   * @param id User id
   */
  private sendWaitYourTurn(id: number): void {
    this.telegram.sendMessage(id, 'Espera tu turno.');
  }

  /**
   * Notify user that it's the wrong card
   * @param id User id
   */
  private sendWrongCard(id: number): void {
    this.telegram.sendMessage(id, 'Acción incorrecta.');
  }

  /**
   * Play user card
   * @param id User id
   * @param cardType Card to play
   */
  playCard(id: number, cardType: string): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // get played card
    const cardIndex = player.cards.findIndex((c: Card) => c.type === cardType);

    // player doesn't have the card
    if (cardIndex === -1) {
      this.telegram.sendMessage(id, 'Carta no encontrada');
      this.sendCardsButtons(code);
      return;
    }

    const card: Card = player.cards.splice(cardIndex, 1)[0];

    // card logic
    switch (cardType) {
      case CardType.EXPLODING_KITTEN:
        // explode
        this.notifyRoom(code, 'ha explotado 💥💥💥', id).then(() => {
          player.alive = false;
          player.cards = [];
          if (!this.checkEndGame(code)) {
            this.nextPlayer(code);
          }
        });
        break;
      case CardType.DEFUSE:
        const explodingIndex: number = player.cards.findIndex(
          (c: Card) => c instanceof ExplodingKittenCard
        );
        // only if player has an exploding
        if (explodingIndex > -1) {
          player.cards.splice(explodingIndex, 1);
          this.notifyRoom(code, 'jugó ' + card.description, id).then(() => {
            // send cards to player
            this.sendCards(code, id).then(() => {
              // put exploding back in the deck
              this.sendAddExplodingKitten(id, code);
            });
          });
        } else {
          // else send cards buttons
          GameUtils.addRandomPosition(player.cards, card);
          this.telegram.sendMessage(id, "No puedes usar esta carta").then(() => {
            this.sendCardsButtons(code);
          });
        }
        break;
      case CardType.ATTACK:
        this.notifyRoom(code, 'jugó un ' + card.description, id).then(() => {
          const attackCard: AttackCard = card as AttackCard;

          this.sendCards(code, id).then(() => {
            this.nextPlayer(code, attackCard.turns);
          });
        });
        break;
      case CardType.SKIP:
        this.notifyRoom(code, 'jugó ' + card.description, id).then(() => {
          this.sendCards(code, id).then(() => {
            this.nextPlayer(code);
          });
        });
        break;
      case CardType.SEE_FUTURE:
        this.notifyRoom(code, 'jugó ' + card.description, id).then(() => {
          const seeFutureCard: SeeFutureCard = card as SeeFutureCard;

          // see cards
          let e = room.deck.length - 1;
          let message = 'Carta superior:\n';
          for (let i = 0; i < seeFutureCard.count && e >= 0; i++, e--) {
            message +=
              'Carta ' + (e + 1) + ' es ' + room.deck[e].description + '\n';
          }
          this.telegram.sendMessage(id, message).then(() => {
            this.sendCardsButtons(code);
          });
        });
        break;
      case CardType.ALTER_FUTURE:
        this.notifyRoom(code, 'jugó ' + card.description, id).then(() => {
          const alterFutureCard: AlterFutureCard = card as AlterFutureCard;
          room.card = alterFutureCard;

          this.alterFuture(id, BotAction.ALTER_THE_FUTURE_RESET);
        });
        break;
      case CardType.SHUFFLE:
        this.notifyRoom(code, 'jugó ' + card.description, id).then(() => {
          // shuffle deck
          room.deck = GameUtils.shuffle(room.deck);

          this.sendCardsButtons(code);
        });
        break;
      case CardType.DRAW_BOTTOM:
        this.notifyRoom(code, 'jugó ' + card.description, id).then(() => {
          this.drawCard(id, false);
        });
        break;
      case CardType.FAVOR:
        this.notifyRoom(code, 'jugó ' + card.description, id).then(() => {
          room.card = card;
          this.chooseOtherPlayer(
            id,
            BotAction.FAVOR_FROM_PLAYER,
            (user: number, other: number) => {
              this.askFavor(user, other);
            }
          );
        });
        break;
      case CardType.FERAL_CAT:
      case CardType.TACOCAT:
      case CardType.CATTERMELON:
      case CardType.HAIRY_POTATO_CAT:
      case CardType.BEARD_CAT:
      case CardType.RAINBOW_CAT:
        this.playCatCards(id, card);
        break;
      default:
        console.log('Carta no reconocida', cardType);
        break;
    }
  }
  /**
   * Ask a user where to put the exploding kitten
   * @param id User id
   * @param code Room code
   */
  private sendAddExplodingKitten(id: number, code: number): void {
    // obtener la sala
    const room: Room = this.getRoom(code);

    // juego terminado
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // verificar si es el turno del usuario
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // verificar si solo quedan exploding kittens en el mazo
    const onlyExploding =
      room.deck.findIndex((c: Card) => !(c instanceof ExplodingKittenCard)) ===
      -1;

    if (onlyExploding) {
      // solo exploding kittens, posición por defecto
      this.addExplodingKitten(id, 0);
    } else {
      // preparar botones
      const buttons: InlineKeyboardButton[][] = [
        [
          // arriba
          Markup.callbackButton(
            'Arriba',
            BotAction.PUT_EXPLODING_BACK_TO_DECK + room.deck.length
          ),
        ],
      ];
      let row = 1;
      for (let i = room.deck.length - 1; i > 0; i--) {
        // crear fila
        if (!buttons[row]) {
          buttons.push([]);
        }

        // agregar botón
        buttons[row].push(
          Markup.callbackButton(
            String(i + 1),
            BotAction.PUT_EXPLODING_BACK_TO_DECK + i
          )
        );

        // máximo 4 botones por fila
        if (buttons[row].length > 3) {
          row++;
        }
      }
      // abajo
      buttons.push([
        Markup.callbackButton(
          'Abajo',
          BotAction.PUT_EXPLODING_BACK_TO_DECK + 0
        ),
      ]);

      // preguntar por la posición
      this.telegram.sendMessage(
        id,
        'Elige la nueva posición del ' + CardDescription.EXPLODING_KITTEN,
        Markup.inlineKeyboard(buttons).oneTime().extra()
      );
    }
  }

  /**
   * Put an exploding kitten back in the deck
   * @param id User id
   * @param position Position in which add the card
   */
  addExplodingKitten(id: number, position: number): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // put exploding kitten in deck
    room.deck.splice(position, 0, new ExplodingKittenCard());

    // next player
    this.nextPlayer(code);
  }

  /**
   * Alter the future
   * @param id User id
   * @param data Selected cards
   */
  alterFuture(id: number, data: string): void {
    // obtener la sala
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // juego terminado
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // verificar si es el turno del usuario
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    if (!room.card || !(room.card instanceof AlterFutureCard)) {
      this.sendWrongCard(id);
      return;
    }
    const card: AlterFutureCard = room.card;

    // información de la carta
    const count: number =
      card.count < room.deck.length ? card.count : room.deck.length;

    // reiniciar acción
    if (data === BotAction.ALTER_THE_FUTURE_RESET) {
      card.cards = [];
    } else if (data !== BotAction.ALTER_THE_FUTURE_OK) {
      const position: number = Number(data);
      // agregar acción
      card.cards.push({ position, card: room.deck[position] });
    }

    const cards: { position: number; card: Card }[] = card.cards;

    let message = cards.length > 0 ? 'Arriba:\n' : '';
    for (const c of cards) {
      message += c.card.description + '\n';
    }

    if (data === BotAction.ALTER_THE_FUTURE_OK && cards.length === count) {
      // alterar el orden
      let e = room.deck.length - 1;
      for (const c of cards) {
        room.deck[e] = c.card;
        e--;
      }

      // enviar botones
      this.sendCardsButtons(code);
      room.card = undefined;
    } else if (cards.length === count - 1) {
      // ya tiene todas las cartas, pedir confirmación
      // obtener la última carta
      let e = room.deck.length - 1;
      for (let i = 0; i < count && e >= 0; i++, e--) {
        if (
          cards.findIndex(
            (c: { position: number; card: Card }) =>
              c.card === room.deck[e] && c.position === e
          ) === -1
        ) {
          message += room.deck[e].description + '\n';
          cards.push({ position: e, card: room.deck[e] });
        }
      }

      // pedir confirmación
      this.telegram.sendMessage(
        id,
        message + '¿Alterar el futuro?',
        Markup.inlineKeyboard([
          Markup.callbackButton(
            'Empezar de nuevo',
            BotAction.ALTER_THE_FUTURE_ACTION + BotAction.ALTER_THE_FUTURE_RESET
          ),
          Markup.callbackButton(
            'Sí',
            BotAction.ALTER_THE_FUTURE_ACTION + BotAction.ALTER_THE_FUTURE_OK
          ),
        ]).extra()
      );
    } else {
      // enviar botones de cartas
      let e = room.deck.length - 1;
      const buttons: InlineKeyboardButton[] = [];
      for (let i = 0; i < count && e >= 0; i++, e--) {
        if (
          cards.findIndex(
            (c: { position: number; card: Card }) =>
              c.card === room.deck[e] && c.position === e
          ) === -1
        ) {
          // botón con datos previos
          buttons.push(
            Markup.callbackButton(
              room.deck[e].description,
              BotAction.ALTER_THE_FUTURE_ACTION + e
            )
          );
        }
      }

      // pedir la siguiente carta
      this.telegram.sendMessage(
        id,
        message +
          'Selecciona la ' +
          (cards.length ? 'siguiente' : 'superior') +
          ' carta:',
        Markup.inlineKeyboard(buttons).extra()
      );
    }
  }

  /**
   * Ask which player
   * @param id User id
   * @param action Action to use
   * @param onePlayer Function to call with one player
   */
  private chooseOtherPlayer(
    id: number,
    action: string,
    onePlayer: (id: number, other: number) => void
  ): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // players button
    let other: number;
    const buttons: InlineKeyboardButton[][] = [];
    for (const p of room.players) {
      if (p.id !== id && p.alive && p.cards.length > 0) {
        // button action
        buttons.push([
          Markup.callbackButton(
            this.userService.getUsername(p.id) +
              ' (' +
              this.getPlayerCardsMessage(p) +
              ')',
            action + p.id
          ),
        ]);
        other = p.id;
      }
    }

    // only one player no need to ask
    if (buttons.length > 1) {
      // ask which player
      this.telegram.sendMessage(
        id,
        'Selecciona un jugador',
        Markup.inlineKeyboard(buttons).extra()
      );
    } else {
      this.telegram
        .sendMessage(id, this.userService.getUsername(other) + ' seleccionado')
        .then(() => {
          onePlayer(id, other);
        });
    }
  }

  /**
   * Ask a player to do a favor
   * @param id User id
   * @param other Other user id
   */
  askFavor(id: number, other: number): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // check card
    if (!room.card || !(room.card instanceof FavorCard)) {
      this.sendWrongCard(id);
      return;
    }
    const card: FavorCard = room.card;
    card.otherPlayer = room.players.find((p: Player) => p.id === other);

    // player not found, ask another player
    if (!card.otherPlayer) {
      this.telegram.sendMessage(id, 'Jugador no encontrado').then(() => {
        this.chooseOtherPlayer(
          id,
          BotAction.FAVOR_FROM_PLAYER,
          (user: number, otherUser: number) => {
            this.askFavor(user, otherUser);
          }
        );
      });
    } else {
      this.notifyRoom(
        code,
        'pidió un favor a ' + this.userService.getUsername(other),
        id
      ).then(() => {
        if (card.otherPlayer.cards.length > 1) {
          // choose card
          const buttons: InlineKeyboardButton[][] = this.getCardsButtons(
            card.otherPlayer,
            false,
            BotAction.DO_FAVOR
          );

          this.telegram.sendMessage(
            other,
            'Elige una carta para dar',
            Markup.inlineKeyboard(buttons).oneTime().extra()
          );
        } else {
          // one card
          const favor: Card = card.otherPlayer.cards[0];
          this.telegram
            .sendMessage(other, 'Vas a dar ' + favor.description)
            .then(() => {
              this.doFavor(other, favor.type);
            });
        }
      });
    }
  }

  /**
   * Do a favor
   * @param id User id
   * @param card Card to give
   */
  doFavor(id: number, card: string): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check card
    if (
      !room.card ||
      !(room.card instanceof FavorCard) ||
      !room.card.otherPlayer ||
      room.card.otherPlayer.id !== id
    ) {
      this.sendWaitYourTurn(id);
      return;
    }
    const favorCard: FavorCard = room.card;

    // find card
    const favorIndex: number = favorCard.otherPlayer.cards.findIndex(
      (c: Card) => c.type === card
    );

    // wrong card
    if (favorIndex === -1) {
      this.askFavor(player.id, id);
    } else {
      const favor: Card = favorCard.otherPlayer.cards.splice(favorIndex, 1)[0];

      // give card
      GameUtils.addRandomPosition(player.cards, favor);
      room.card = undefined;

      // send cards to other player
      this.sendCards(code, id).then(() => {
        this.telegram
          .sendMessage(player.id, 'Recibiste ' + favor.description)
          .then(() => {
            this.sendCardsButtons(code);
          });
      });
    }
  }

  /**
   * Count cat cards
   * @param player Cards of the player
   * @param catType Cat to count
   * @param feral Count feral
   */
  private countCatCards(
    player: Player,
    catType: string,
    feral: boolean = true
  ): number {
    let count = 1;
    for (const card of player.cards) {
      if (
        card.type === catType ||
        (feral && card.type === CardType.FERAL_CAT)
      ) {
        count++;
      }
    }

    return count;
  }

  /**
   * Play a cat card
   * @param id User id
   * @param card Card played
   */
  private playCatCards(id: number, card: Card): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    const total: number = this.countCatCards(player, card.type);
    if (total > 1) {
      room.card = card;
      // can play
      const specific: number = this.countCatCards(player, card.type, false);
      const feral: number = total - specific;

      const buttons: InlineKeyboardButton[][] = [
        [Markup.callbackButton('Cancelar', BotAction.CANCEL_CARD)],
        [Markup.callbackButton('Usar 2: robar una carta', BotAction.STEAL_CARD)],
      ];

      if (total > 2) {
        buttons.push([
          Markup.callbackButton('Usar 3: pedir una carta', BotAction.REQUEST_CARD),
        ]);
      }
      let message =
        '¿Qué quieres hacer?\nTienes ' +
        specific +
        ' ' +
        card.description;
      if (feral > 0) {
        message += ' y ' + feral + ' ' + CardDescription.FERAL_CAT;
        message += '\nEl primero que se usará será el Feral.';
      }
      this.telegram.sendMessage(
        id,
        message,
        Markup.inlineKeyboard(buttons).oneTime().extra()
      );
    } else {
      GameUtils.addRandomPosition(player.cards, card);
      // not enough cat cards, send cards
      this.telegram
        .sendMessage(id, 'No tienes suficientes cartas de ' + card.description)
        .then(() => {
          this.sendCardsButtons(code);
        });
    }
  }

  /**
   * Cancel current operation
   * @param id User id
   */
  cancelCard(id: number): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // gives the user back his card
    if (room.card) {
      GameUtils.addRandomPosition(player.cards, room.card);
    }

    // send buttons again
    this.sendCardsButtons(code);
  }

  /**
   * Request a card
   * @param id User id
   */
  requestCard(id: number): void {
    this.stealCard(id, 2);
  }

  /**
   * Steal a card
   * @param id User id
   * @param cardNumber Cards to use
   */
  stealCard(id: number, cardNumber: number = 1): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // check card
    if (!room.card || !(room.card instanceof CatCard)) {
      this.sendWrongCard(id);
      return;
    }
    const card: CatCard = room.card;
    card.resetCount();

    for (let i = 0; i < cardNumber; i++) {
      // remove other card
      if (this.removeCard(player, card.type)) {
        card.otherCards++;
      } else {
        this.removeCard(player, CardType.FERAL_CAT);
        card.otherFeralCards++;
      }
    }

    // action
    card.action = cardNumber === 1 ? 'steal' : 'request';

    this.chooseOtherPlayer(
      id,
      BotAction.STEAL_FROM_PLAYER,
      (user: number, otherUser: number) => {
        this.chooseCardToSteal(user, otherUser);
      }
    );
  }

  /**
   * Remove a card if exists
   * @param player Player's cards
   * @param cardType Type to remove
   */
  private removeCard(player: Player, cardType: string): boolean {
    let removed = false;

    const index: number = player.cards.findIndex(
      (c: Card) => c.type === cardType
    );

    if (index !== -1) {
      removed = true;
      player.cards.splice(index, 1);
    }

    return removed;
  }

  /**
   * Choose a card to steal
   * @param id User id
   * @param other Other user to steal
   */
  chooseCardToSteal(id: number, other: number): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // check card
    if (!room.card || !(room.card instanceof CatCard)) {
      this.sendWrongCard(id);
      return;
    }
    const card: CatCard = room.card;
    card.otherPlayer = room.players.find((p: Player) => p.id === other);

    // player not found, ask another player
    if (!card.otherPlayer) {
      this.telegram.sendMessage(id, 'Jugador no encontrado').then(() => {
        this.chooseOtherPlayer(
          id,
          BotAction.STEAL_FROM_PLAYER,
          (user: number, otherUser: number) => {
            this.chooseCardToSteal(user, otherUser);
          }
        );
      });
    } else if (card.action === 'steal') {
      // steal
      this.notifyRoom(
        code,
        this.catCardUsedMessage(card) +
          '\nEl jugador está robando a ' +
          this.userService.getUsername(other),
        id
      ).then(() => {
        // based on other player cards
        if (card.otherPlayer.cards.length > 1) {
          const buttons: InlineKeyboardButton[][] = [];
          let row = 0;
          for (let i = 0; i < card.otherPlayer.cards.length; i++) {
            // create row
            if (!buttons[row]) {
              buttons.push([]);
            }

            // add button
            buttons[row].push(
              Markup.callbackButton(String(i + 1), BotAction.CARD_TO_STEAL + i)
            );

            // max 4 buttons per row
            if (buttons[row].length > 3) {
              row++;
            }
          }

          // choose card
          this.telegram.sendMessage(
            id,
            'Elige una carta para robar',
            Markup.inlineKeyboard(buttons).oneTime().extra()
          );
        } else {
          // one card
          this.doSteal(id, '0');
        }
      });
    } else {
      // request
      const buttons: InlineKeyboardButton[][] = [];
      for (const c of room.mode.cardsTypes) {
        // add button
        buttons.push([
          Markup.callbackButton(
            c.description,
            BotAction.CARD_TO_STEAL + c.type
          ),
        ]);
      }

      this.notifyRoom(
        code,
        this.catCardUsedMessage(card) +
          '\nEl jugador está pidiendo a ' +
          this.userService.getUsername(other) +
          ' una carta',
        id
      ).then(() => {
        this.telegram.sendMessage(
          id,
          'Elige una carta para pedir',
          Markup.inlineKeyboard(buttons).oneTime().extra()
        );
      });
    }
  }

  /**
   * Create a message with cards used to steal/request
   * @param card Cat card used
   */
  private catCardUsedMessage(card: CatCard): string {
    // add cards to message
    const main: number = card.otherCards + 1;
    let message = 'jugó ' + String(main) + ' ' + card.description;
    if (card.otherFeralCards > 0) {
      message +=
        ' y ' +
        String(card.otherFeralCards) +
        ' ' +
        CardDescription.FERAL_CAT;
    }
    message += '.';

    return message;
  }

  /**
   * Steal a card
   * @param id User id
   * @param data What to steal
   */
  doSteal(id: number, data: string): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    // game ended
    if (!room) {
      this.sendStartSuggestion(id);
      return;
    }

    const player: Player = room.players[room.currentPlayer];

    // check user playing
    if (player.id !== id) {
      this.sendWaitYourTurn(id);
      return;
    }

    // check card
    if (!room.card || !(room.card instanceof CatCard)) {
      this.sendWrongCard(id);
      return;
    }
    const card: CatCard = room.card;

    if (card.action === 'steal') {
      // steal
      const index: number = Number(data);

      const stolen: Card = card.otherPlayer.cards.splice(index, 1)[0];
      GameUtils.addRandomPosition(player.cards, stolen);

      this.telegram
        .sendMessage(
          card.otherPlayer.id,
          stolen.description + ' fue robada de tu mano'
        )
        .then(() => {
          this.sendCards(code, card.otherPlayer.id).then(() => {
            this.telegram
              .sendMessage(id, 'Robaste ' + stolen.description)
              .then(() => {
                this.sendCardsButtons(code);
              });
          });
        });
    } else {
      // request
      const index: number = card.otherPlayer.cards.findIndex(
        (c: Card) => c.type === data
      );

      let message: string;
      if (index === -1) {
        message =
          'no pudo robar ' +
          CardFactory.descriptions[data] +
          ' de ' +
          this.userService.getUsername(card.otherPlayer.id);
      } else {
        // other player has the card
        const stolen: Card = card.otherPlayer.cards.splice(index, 1)[0];
        GameUtils.addRandomPosition(player.cards, stolen);

        message =
          'robó ' +
          stolen.description +
          ' de ' +
          this.userService.getUsername(card.otherPlayer.id);
      }

      this.notifyRoom(code, message, id).then(() => {
        this.sendCards(code, card.otherPlayer.id).then(() => {
          this.sendCardsButtons(code);
        });
      });
    }

    room.card = undefined;
  }

  /**
   * Check if game has ended and a player has won
   * @param code Room code
   */
  private checkEndGame(code: number): boolean {
    // get room
    const room: Room = this.getRoom(code);

    let end = false;
    let alive = 0;
    let winner: number = null;

    // count player alive
    for (const player of room.players) {
      if (player.alive) {
        winner = player.id;
        alive++;
      }
      // check if game has finished
      end = alive < 2;
    }

    // end game and destroy room
    if (end) {
      this.notifyRoom(code, 'ganó la partida 👑👑🐈', winner).then(() => {
        this.stopGame(winner);
      });
    }

    return end;
  }

  /**
   * End current player turn
   * @param code Room code
   * @param turns Turns that the player has to play
   */
  nextPlayer(code: number, turns: number = 1): void {
    // get room
    const room: Room = this.getRoom(code);
    room.turns--;

    // player is not alive
    if (
      !room.players[room.currentPlayer] ||
      !room.players[room.currentPlayer].alive ||
      room.turns < 0
    ) {
      room.turns = 0;
    }

    // player ended his turns or he's attacking
    if (room.turns === 0 || turns > 1) {
      let alive = false;
      // find next player alive
      while (!alive) {
        if (room.currentPlayer < room.players.length - 1) {
          room.currentPlayer++;
        } else {
          room.currentPlayer = 0;
        }

        alive = room.players[room.currentPlayer].alive;
      }

      // se sono stati impostati dei turni
      room.turns += turns;
    }

    // send message
    this.sendNextPlayer(room);
  }

  /**
   * Sends next player infos
   * @param room Room to send
   */
  private sendNextPlayer(room: Room): void {
    // @name turn. Player has n cards. m turns left. k cards left in the deck
    const player: Player = room.players[room.currentPlayer];
    let message = 'turno. ';
    message += room.turns + ' turno' + (room.turns > 1 ? 's' : '') + ' restantes.\n';
    message += 'El jugador tiene ' + this.getPlayerCardsMessage(player) + '.\n';
    const deck: number = room.deck.length;
    message += deck + ' carta' + (deck > 1 ? 's' : '') + ' restantes en el mazo.\n';
    // players alive
    let alive = 0;
    for (const p of room.players) {
      if (p.alive) {
        alive++;
      }
    }
    message += alive + ' jugador' + (alive > 1 ? 'es' : '') + ' aún siguen vivos.';

    this.notifyRoom(room.id, message, player.id).then(() => {
      // send cards button
      this.sendCardsButtons(room.id);
    });
  }

  /**
   * Get a message with the number of cards
   * @param player Player to count
   */
  private getPlayerCardsMessage(player: Player): string {
    return (
      player.cards.length + ' carta' + (player.cards.length === 1 ? '' : 's')
    );
  }

  /**
   * Stop a game
   * @param id Player id
   */
  stopGame(id: number): void {
    // get room
    const code: number = this.userService.getRoom(id);
    const room: Room = this.getRoom(code);

    if (room) {
      // notify users
      this.notifyRoom(code, 'Partida terminada. Envía /start para jugar de nuevo').then(
        () => {
          // destroy room
          this.destroyRoom(code);
        }
      );
    }
  }

  /**
   * Destroy the room
   * @param code Room code
   */
  private destroyRoom(code: number): void {
    const room: Room = this.getRoom(code);

    // remove all players
    for (const player of room.players) {
      this.userService.setRoom(player.id);
    }

    // destroy room
    delete this.rooms[code];
  }

  /**
   * Exit a game
   * @param id Player id
   */
  exitGame(id: number): boolean {
    let exit = false;

    // reset user room
    const code = this.userService.getRoom(id);

    // remove user from room
    const room = this.getRoom(code);
    if (room) {
      exit = true;
      const playerIndex = room.players.findIndex((p: Player) => p.id === id);
      const player: Player = room.players.splice(playerIndex, 1)[0];

      if (room.players.length === 0) {
        // if there are no more players
        this.destroyRoom(code);
      } else if (player.host && !room.running) {
        // stop game
        this.stopGame(room.players[0].id);
      } else {
        // keep playing
        let message =
          'se desconectó. [' +
          room.players.length +
          '/' +
          room.mode.maxPlayers +
          '] jugadores.';

        // remove exploding kitten
        if (room.deck && room.deck.length > 0) {
          const explodingIndex: number = room.deck.findIndex(
            (c: Card) => c instanceof ExplodingKittenCard
          );
          // only if player has an exploding
          if (explodingIndex > -1) {
            const card: Card = room.deck.splice(explodingIndex, 1)[0];
            message += ' Se eliminó ' + card.description;
          }
        }

        if (
          room.card &&
          room.card instanceof OtherPlayerCard &&
          room.card.otherPlayer &&
          room.card.otherPlayer.id === id
        ) {
          // if favor and player disconnected
          if (room.card instanceof FavorCard) {
            // give random card
            this.doFavor(player.id, GameUtils.randomCard(player.cards).type);
          }
        }

        // notify players
        this.notifyRoom(code, message, id).then(() => {
          // disconnect player
          this.userService.setRoom(id);
          this.telegram.sendMessage(id, 'Desconectado');

          // if game is not ended
          if (!this.checkEndGame(code)) {
            // next player if he was the current player
            if (room.currentPlayer === playerIndex) {
              room.currentPlayer--;
              room.turns = 0;
              this.nextPlayer(code);
            }
          }
        });
      }
    }

    return exit;
  }

  /**
   * Send a message to all users
   * @param code Room code
   * @param message Message to send
   * @param userId Username to add at the beginnig of the message
   */
  private notifyRoom(
    code: number,
    message: string,
    userId: number = -1
  ): Promise<Message[]> {
    const room: Room = this.getRoom(code);

    // add username
    if (userId !== -1) {
      message = this.userService.getUsername(userId) + ' ' + message;
    }

    const result: Promise<Message>[] = [];
    for (const player of room.players) {
      result.push(this.telegram.sendMessage(player.id, message));
    }

    return Promise.all(result);
  }
}
