import { User } from './user';

/**
 * User manager
 */
export class UserService {
  /**
   * Singleton
   */
  private static instance: UserService = null;

  /**
   * Users registered
   */
  private users: Record<number, User> = {};

  private constructor() {}

  /**
   * Get the instance
   */
  static getInstance(): UserService {
    if (UserService.instance == null) {
      UserService.instance = new UserService();
    }

    return UserService.instance;
  }

  /**
   * Create user if not exists
   * @param id User id
   * @param username Username
   */
  registerUser(id: number, username: string): void {
    if (!this.users[id]) {
      this.users[id] = new User(id, username);
    } else if (this.users[id].username !== username) {
      this.users[id].username = username;
    }
  }

  /**
   * Gets a user
   * @param id User id
   */
  private getUser(id: number): User {
    return this.users[id];
  }

  /**
   * Get a user username
   * @param id User id
   */
  getUsername(id: number): string {
    return this.getUser(id).username;
  }

  /**
   * Get a user room
   * @param  id User id
   */
  getRoom(id: number): number {
    const user = this.getUser(id);
    return user.room;
  }

  /**
   * Register user room
   * @param id User id
   * @param room Room in which the user is playing
   */
  setRoom(id: number, room: number = null): void {
    const user = this.getUser(id);
    user.room = room;
  }
}
