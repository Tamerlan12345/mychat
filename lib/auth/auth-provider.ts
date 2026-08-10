export interface AuthResult {
  success: boolean;
  error?: string;
  userId?: string;
}

export interface IAuthProvider {
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  getCurrentUserId(): Promise<string | null>;
  onAuthStateChange(callback: (userId: string | null) => void): () => void;
}
