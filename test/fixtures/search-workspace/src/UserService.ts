export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  public findUserById(id: string): User | undefined {
    if (id === 'admin') {
      return { id: 'admin', name: 'Administrator', email: 'admin@example.com' };
    }
    return undefined;
  }

  public deleteUser(id: string): boolean {
    return id.length > 0;
  }
}
