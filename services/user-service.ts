import { globalDataProvider } from '@/lib/provider/mock-provider';
import { User, Department, UserStatus } from '@/types';

export class UserService {
  static async getUsers(): Promise<User[]> {
    return globalDataProvider.getUsers();
  }

  static async getUserById(id: string): Promise<User | null> {
    return globalDataProvider.getUserById(id);
  }

  static async searchUsers(query: string): Promise<User[]> {
    return globalDataProvider.searchUsers(query);
  }

  static async createUser(userData: Partial<User>): Promise<User> {
    return globalDataProvider.createUser(userData);
  }

  static async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return globalDataProvider.updateUser(id, updates);
  }

  static async deleteUser(id: string): Promise<boolean> {
    return globalDataProvider.deleteUser(id);
  }

  static async setUserStatus(id: string, status: UserStatus): Promise<User> {
    return globalDataProvider.setUserStatus(id, status);
  }

  static async getDepartments(): Promise<Department[]> {
    return globalDataProvider.getDepartments();
  }

  static async createDepartment(name: string, description?: string): Promise<Department> {
    return globalDataProvider.createDepartment(name, description);
  }

  static async updateDepartment(id: string, name: string, description?: string): Promise<Department> {
    return globalDataProvider.updateDepartment(id, name, description);
  }

  static async deleteDepartment(id: string): Promise<boolean> {
    return globalDataProvider.deleteDepartment(id);
  }
}
