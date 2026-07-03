import { create } from 'zustand';
import { login as apiLogin, logout as apiLogout, initApi, isAuthenticated, type ApiUser } from './api';

interface AuthState {
  user: ApiUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  init: async () => {
    await initApi();
    set({ isAuthenticated: isAuthenticated(), isLoading: false });
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const user = await apiLogin(email, password);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Error de autenticación',
      });
    }
  },

  logout: async () => {
    await apiLogout();
    set({ user: null, isAuthenticated: false });
  },

  clearError: () => set({ error: null }),
}));
