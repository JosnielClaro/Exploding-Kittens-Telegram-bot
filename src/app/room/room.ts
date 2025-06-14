import { Mode } from '../game/game-factory';
import { Card } from './../game/card';
import { Player } from './player';

/**
 * Room info
 */
export class Room {
  /**
   * Identifier
   */
  id: number;

  /**
   * Players in the room
   */
  players: Player[];

  /**
   * Room mode
   */
  mode: Mode;

  /**
   * Deck of cards
   */
  deck: Card[];

  /**
   * Index of the player that should play
   */
  currentPlayer: number;

  /**
   * Number of turns to play
   */
  turns: number;

  /**
   * Game is running
   */
  running: boolean;

  /**
   * Card that is beign played
   */
  card: Card;

  constructor(id: number, mode: Mode) {
    this.id = id;
    this.players = [];
    this.currentPlayer = 0;
    this.turns = 1;
    this.running = false;
    this.mode = mode;
  }
}
