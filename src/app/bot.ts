import { Markup, Telegraf } from 'telegraf';
import { TelegrafContext } from 'telegraf/typings/context';

import { BotAction } from './bot-action.enum';
import { CardDescription, CardFactory, CardType } from './game/card';
import { GameFactory } from './game/game-factory';
import { Room } from './room/room';
import { RoomService } from './room/room-service';
import { UserService } from './user/user-service';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Bot manager
 */
export class Bot {
  /**
   * Singleton
   */
  private static instance: Bot = null;

  /**
   * User service
   */
  private userService: UserService = UserService.getInstance();

  /**
   * Room service
   */
  private roomService: RoomService = RoomService.getInstance();

  /**
   * Bot instace
   */
  private bot = new Telegraf(process.env.BOT_TOKEN);

  /**
   * Tells if the bot has been launched
   */
  private running = false;

  private constructor() {
    this.registerMiddlewares();
  }

  /**
   * Get the instance
   */
  static getInstance(): Bot {
    if (Bot.instance == null) {
      Bot.instance = new Bot();
    }

    return Bot.instance;
  }

  /**
   * Launch the bot
   */
  launch(): void {
    if (!this.running) {
      this.bot.launch();
      this.running = true;
    }
  }

  /**
   * Register all the middlewares
   */
  private registerMiddlewares(): void {
    // start command
    this.bot.start((ctx) => {
      this.registerUser(ctx);

      if (this.userService.getRoom(ctx.from.id)) {
        ctx.reply('Ya estás jugando. Envía /stop para desconectarte.');
      } else {
        // start game request
        ctx.reply(
          '¿Qué quieres hacer?',
          Markup.inlineKeyboard([
            Markup.callbackButton('Crear partida', 'host'),
            Markup.callbackButton('Unirse a partida', 'join'),
          ]).extra()
        );
      }
    });

    // help command
    this.bot.help((ctx) => {
      this.registerUser(ctx);

      ctx.reply(
        '/start Iniciar una nueva partida\n/stop Terminar la partida actual',
        Markup.inlineKeyboard([
          Markup.urlButton('Reglas', 'http://bit.ly/37OKl0x'),
        ]).extra()
      );
    });

    // stop command
    this.bot.command('stop', (ctx) => {
      this.registerUser(ctx);
      if (!this.roomService.exitGame(ctx.from.id)) {
        ctx.reply('No estás jugando');
      }
    });

    this.host();
    this.join();
    this.player();
    this.textListener();
    this.actionListener();
  }

  /**
   * Create user if not exists
   * @param ctx Telegram context
   */
  registerUser(ctx: TelegrafContext): void {
    let username = '';
    if (ctx.from.username) {
      username += '@' + ctx.from.username;
    } else {
      username += ctx.from.first_name ? ctx.from.first_name : '';
      username += ctx.from.first_name && ctx.from.last_name ? ' ' : '';
      username += ctx.from.last_name ? ctx.from.last_name : '';
    }

    this.userService.registerUser(ctx.from.id, username);
  }

  /**
   * Host related commands
   */
  private host(): void {
    // host a game, ask for a mode
    this.bot.action('host', (ctx) => {
      this.registerUser(ctx);
      try {
        ctx.editMessageText('Creando una nueva partida');
      } catch (err) {
        if (
          err.description && err.description.includes('message is not modified')
        ) {
          // Ignorar el error, no hay cambios
        } else {
          throw err;
        }
      }
      ctx.reply(
        'Elige el modo',
        Markup.inlineKeyboard(GameFactory.getModesButtons()).extra()
      );
    });

    /**
     * mode selected, create room
     */
    this.bot.action(GameFactory.getModesActions(), (ctx) => {
      this.registerUser(ctx);

      // create room
      const room: Room = this.roomService.hostGame(
        ctx.from.id,
        ctx.callbackQuery.data
      );

      try {
        ctx.editMessageText('Sala creada: ' + room.mode.description);
      } catch (err) {
        if (
          err.description && err.description.includes('message is not modified')
        ) {
          // Ignorar el error, no hay cambios
        } else {
          throw err;
        }
      }
      ctx.reply(
        'Código de sala: ' + room.id,
        Markup.inlineKeyboard([
          Markup.callbackButton('Cancelar', BotAction.CANCEL_GAME),
          Markup.callbackButton('Iniciar', BotAction.START_GAME),
        ]).extra()
      );
    });

    /**
     * Cancel Game
     */
    this.bot.action(BotAction.CANCEL_GAME, (ctx) => {
      this.registerUser(ctx);

      this.roomService.stopGame(ctx.from.id);

      try {
        ctx.editMessageText('Partida finalizada');
      } catch (err) {
        if (
          err.description && err.description.includes('message is not modified')
        ) {
          // Ignorar el error, no hay cambios
        } else {
          throw err;
        }
      }
    });

    /**
     * Start Game
     */
    this.bot.action(BotAction.START_GAME, (ctx) => {
      this.registerUser(ctx);

      const started = this.roomService.startGame(ctx.from.id);

      if (started) {
        try {
          ctx.editMessageText('Partida iniciada');
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }
      } else {
        ctx.reply('No hay suficientes jugadores para iniciar la partida');
      }
    });
  }

  /**
   * Partecipant related command
   */
  private join(): void {
    // join game
    this.bot.action('join', (ctx) => {
      this.registerUser(ctx);
      try {
        ctx.editMessageText('Uniéndote a una partida existente');
      } catch (err) {
        if (
          err.description && err.description.includes('message is not modified')
        ) {
          // Ignorar el error, no hay cambios
        } else {
          throw err;
        }
      }
      this.askRoomCode(ctx);
    });
  }

  /**
   * Send a request for the room code
   * @param ctx Telegram context
   */
  private askRoomCode(ctx: TelegrafContext): void {
    ctx.reply('Introduce el código de la sala', Markup.forceReply().extra());
  }

  /**
   * Handles text messages
   */
  private textListener(): void {
    this.bot.on('text', (ctx) => {
      this.registerUser(ctx);

      // join request
      if (
        ctx.message.reply_to_message &&
        ctx.message.reply_to_message.text === 'Introduce el código de la sala'
      ) {
        const room: Room = this.roomService.joinGame(
          ctx.from.id,
          Number(ctx.message.text)
        );

        // send room info
        if (room) {
          ctx.reply(
            'Te has unido a la sala: ' +
            room.mode.description +
            '. Envía /stop para desconectarte.'
          );
        } else {
          ctx.reply("La sala no existe").then(() => {
            this.askRoomCode(ctx);
          });
        }
      } else {
        // unknown requests
        ctx.reply(
          'Comando desconocido "' +
          ctx.message.text +
          '". Envía /help para más información.'
        );
      }
    });
  }

  /**
   * Handles action messages
   */
  actionListener(): void {
    this.bot.on('callback_query', (ctx) => {
      this.registerUser(ctx);

      // exploding kittes in deck
      if (
        ctx.callbackQuery.data.startsWith(BotAction.PUT_EXPLODING_BACK_TO_DECK)
      ) {
        const position: number = Number(
          ctx.callbackQuery.data.replace(
            BotAction.PUT_EXPLODING_BACK_TO_DECK,
            ''
          )
        );
        try {
          ctx.editMessageText('Elegiste la posición: ' + (position + 1));
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        // add back
        this.roomService.addExplodingKitten(ctx.from.id, position);
      } else if (
        ctx.callbackQuery.data.startsWith(BotAction.ALTER_THE_FUTURE_ACTION)
      ) {
        const data: string = ctx.callbackQuery.data.replace(
          BotAction.ALTER_THE_FUTURE_ACTION,
          ''
        );
        try {
          ctx.editMessageText(ctx.callbackQuery.message.text);
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        // alter future
        this.roomService.alterFuture(ctx.from.id, data);
      } else if (ctx.callbackQuery.data.startsWith(BotAction.STEAL_CARD)) {
        try {
          ctx.editMessageText('Elegiste robar una carta');
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        this.roomService.stealCard(ctx.from.id);
      } else if (ctx.callbackQuery.data.startsWith(BotAction.CANCEL_CARD)) {
        try {
          ctx.editMessageText('Cancelaste la operación');
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        this.roomService.cancelCard(ctx.from.id);
      } else if (ctx.callbackQuery.data.startsWith(BotAction.REQUEST_CARD)) {
        try {
          ctx.editMessageText('Elegiste pedir una carta');
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        this.roomService.requestCard(ctx.from.id);
      } else if (
        ctx.callbackQuery.data.startsWith(BotAction.STEAL_FROM_PLAYER)
      ) {
        const player: number = Number(
          ctx.callbackQuery.data.replace(BotAction.STEAL_FROM_PLAYER, '')
        );
        try {
          ctx.editMessageText(
            'Robar a: ' + this.userService.getUsername(player)
          );
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        // player
        this.roomService.chooseCardToSteal(ctx.from.id, player);
      } else if (ctx.callbackQuery.data.startsWith(BotAction.CARD_TO_STEAL)) {
        const data: string = ctx.callbackQuery.data.replace(
          BotAction.CARD_TO_STEAL,
          ''
        );
        try {
          ctx.editMessageText('Carta elegida');
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        this.roomService.doSteal(ctx.from.id, data);
      } else if (
        ctx.callbackQuery.data.startsWith(BotAction.FAVOR_FROM_PLAYER)
      ) {
        const player: number = Number(
          ctx.callbackQuery.data.replace(BotAction.FAVOR_FROM_PLAYER, '')
        );
        try {
          ctx.editMessageText(
            'Pedir favor a: ' + this.userService.getUsername(player)
          );
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        this.roomService.askFavor(ctx.from.id, player);
      } else if (ctx.callbackQuery.data.startsWith(BotAction.DO_FAVOR)) {
        const data: string = ctx.callbackQuery.data.replace(
          BotAction.DO_FAVOR,
          ''
        );
        try {
          ctx.editMessageText(
            'Vas a dar: ' + CardFactory.descriptions[data]
          );
        } catch (err) {
          if (
            err.description && err.description.includes('message is not modified')
          ) {
            // Ignorar el error, no hay cambios
          } else {
            throw err;
          }
        }

        this.roomService.doFavor(ctx.from.id, data);
      } else {
        // unknown requests
        ctx.reply(
          'Comando desconocido "' +
          ctx.message.text +
          '". Envía /help para más información.'
        );
      }
    });
  }

  /**
   * Player commands
   */
  player(): void {
    /**
     * Draw
     */
    this.bot.action(BotAction.DRAW, (ctx) => {
      this.registerUser(ctx);
      try {
        ctx.editMessageText('Has robado:');
      } catch (err) {
        if (
          err.description && err.description.includes('message is not modified')
        ) {
          // Ignorar el error, no hay cambios
        } else {
          throw err;
        }
      }
      this.roomService.drawCard(ctx.from.id);
    });

    /**
     * Cards
     */
    this.bot.action(Object.values(CardType), (ctx) => {
      this.registerUser(ctx);
      try {
        ctx.editMessageText(
          'Has jugado: ' + CardFactory.descriptions[ctx.callbackQuery.data]
        );
      } catch (err) {
        if (
          err.description && err.description.includes('message is not modified')
        ) {
          // Ignorar el error, no hay cambios
        } else {
          throw err;
        }
      }

      this.roomService.playCard(ctx.from.id, ctx.callbackQuery.data);
    });

    /**
     * Defuse exploding
     */
    this.bot.action(BotAction.DEFUSE_KITTEN, (ctx) => {
      this.registerUser(ctx);
      try {
        ctx.editMessageText('Has jugado: ' + CardDescription.DEFUSE);
      } catch (err) {
        if (
          err.description && err.description.includes('message is not modified')
        ) {
          // Ignorar el error, no hay cambios
        } else {
          throw err;
        }
      }

      this.roomService.playCard(ctx.from.id, CardType.DEFUSE);
    });

    /**
     * Explode
     */
    this.bot.action(BotAction.EXPLODE, (ctx) => {
      this.registerUser(ctx);
      try {
        ctx.editMessageText('Has jugado: ' + CardDescription.EXPLODING_KITTEN);
      } catch (err) {
        if (
          err.description && err.description.includes('message is not modified')
        ) {
          // Ignorar el error, no hay cambios
        } else {
          throw err;
        }
      }
      

      this.roomService.playCard(ctx.from.id, CardType.EXPLODING_KITTEN);
    });
  }
}
