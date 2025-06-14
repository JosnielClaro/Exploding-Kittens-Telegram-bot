import { Card } from './../game/card';

/**
 * Player
 */
export class Player {
  /**
   * User id
   */
  id: number;

  /**
   * Host of the game
   */
  host: boolean;

  /**
   * Player cards
   */
  cards: Card[];

  /**
   * Player is alive and can play
   */
  alive: boolean;

  constructor(id: number, host: boolean) {
    this.id = id;
    this.host = host;
    this.cards = [];
    this.alive = true;
  }
}
