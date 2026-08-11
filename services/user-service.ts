import { getDataProvider } from '@/lib/provider';
import { User, Department, UserStatus } from '@/types';

export class UserService {
  static async getUsers(): Promise<User[]> {
    return getDataProvider().getUsers();
  }

  static async getUserById(id: string): Promise<User | null> {
    return getDataProvider().getUserById(id);
  }

  static async searchUsers(query: string): Promise<User[]> {
    return getDataProvider().searchUsers(query);
  }

  static async createUser(userData: Partial<User>): Promise<User> {
    return getDataProvider().createUser(userData);
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return getDataProvider().updateUser(id, updates);
  }

  static async deleteUser(id: string): Promise<boolean> {
    return getDataProvider().deleteUser(id);
  }

  static async setUserStatus(id: string, status: UserStatus): Promise<User> {
    return getDataProvider().setUserStatus(id, status);
  }

  static async getDepartments(): Promise<Department[]> {
    return getDataProvider().getDepartments();
  }

  static async createDepartment(name: string, description?: string): Promise<Department> {
    return getDataProvider().createDepartment(name, description);
  }

  static async updateDepartment(id: string, name: string, description?: string): Promise<Department> {
    return getDataProvider().updateDepartment(id, name, description);
  }

  static async deleteDepartment(id: string): Promise<boolean> {
    return getDataProvider().deleteDepartment(id);
  }
}
