import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
interface User {
  username: string;
  role: 'admin' | 'coder';
}
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  login: (username: string, pass: string) => Promise<void>;
  logout: () => void;
}
// Mock user database
const MOCK_USERS: Record<string, { pass: string; role: 'admin' | 'coder' }> = {
  'admin': { pass: 'password', role: 'admin' },
  'coder': { pass: 'password', role: 'coder' },
  'superadmin': { pass: 'password123', role: 'admin' },
};
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      login: async (username, pass) => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            const userCredentials = MOCK_USERS[username];
            if (userCredentials && userCredentials.pass === pass) {
              const user: User = { username, role: userCredentials.role };
              set({ isAuthenticated: true, user });
              resolve();
            } else {
              reject(new Error('Invalid username or password'));
            }
          }, 500);
        });
      },
      logout: () => {
        set({ isAuthenticated: false, user: null });
      },
    }),
    {
      name: 'auth-storage', // unique name
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
    }
  )
);