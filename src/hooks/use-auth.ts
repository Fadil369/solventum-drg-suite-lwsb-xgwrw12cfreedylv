import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
interface User {
  username: string;
  role: 'admin' | 'coder';
}
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  login: (username: string, pass: string) => Promise<void>;
  logout: () => void;
}
// Authenticates against the server (POST /api/auth/login), which verifies a
// salted PBKDF2 password hash and returns a signed session token. No
// credentials are ever stored client-side beyond the resulting token, and
// that token is required by the server for every other /api/* call (see
// src/lib/api-client.ts) — this used to be a purely client-side mock with a
// hardcoded plaintext credential table shipped in the JS bundle.
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      user: null,
      token: null,
      login: async (username, pass) => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password: pass }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Invalid username or password');
        }
        const { token, username: uname, role } = json.data as { token: string; username: string; role: 'admin' | 'coder' };
        set({ isAuthenticated: true, user: { username: uname, role }, token });
      },
      logout: () => {
        set({ isAuthenticated: false, user: null, token: null });
      },
    }),
    {
      name: 'auth-storage', // unique name
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
    }
  )
);
