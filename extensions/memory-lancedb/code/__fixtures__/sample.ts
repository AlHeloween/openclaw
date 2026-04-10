interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private users: User[] = [];

  async getUser(id: string): Promise<User | null> {
    if (!id) {
      return null;
    }
    const user = this.users.find((u) => u.id === id);
    return user ?? null;
  }

  async createUser(name: string, email: string): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      name,
      email,
    };
    this.users.push(user);
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const idx = this.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      return false;
    }
    this.users.splice(idx, 1);
    return true;
  }
}

export const formatUser = (user: User): string => {
  return `${user.name} <${user.email}>`;
};

const helper = (x: number): number => {
  return x * 2;
};
