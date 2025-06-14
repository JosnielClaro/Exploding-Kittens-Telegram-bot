import { Card } from './card';

/**
 * Game utils methods
 */
export class GameUtils {
  /**
   * Shuffle an array
   * @param array Array to shuffle
   */
  static shuffle<T>(array: T[]): T[] {
    let currentIndex: number = array.length;
    let temporaryValue: T = null;
    let randomIndex: number = null;

    // While there remain elements to shuffle...
    while (currentIndex > 0) {
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }

    return array;
  }

  /**
   * Get a random number between 0 and max
   * @param max Max number, not included
   */
  private static getRandomNumber(max: number): number {
    return Math.floor(Math.random() * Math.floor(max));
  }

  /**
   * Get a random card
   * @param cards Cards
   */
  static randomCard(cards: Card[]): Card {
    const randomIndex: number = this.getRandomNumber(cards.length);

    return cards[randomIndex];
  }

  /**
   * Add a card in a random position
   * @param cards Array
   * @param card Card to add
   */
  static addRandomPosition(cards: Card[], card: Card): void {
    const randomIndex: number = this.getRandomNumber(cards.length);

    cards.splice(randomIndex, 0, card);
  }
}
