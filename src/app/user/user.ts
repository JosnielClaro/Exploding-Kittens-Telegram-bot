/**
 * User info
 */
export class User {
  /**
   * User id
   */
  id: number;

  /**
   * Username
   */
  username: string;

  /**
   * Number in which the user is playing
   */
  room: number;

  constructor(id: number, username: string) {
    this.id = id;
    this.username = username;
  }
}
