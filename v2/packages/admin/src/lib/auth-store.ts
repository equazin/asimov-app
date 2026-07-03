import { create } from 'zustand';
import { apiPost } from './api';

interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (access: string, refresh: string, user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null,
  refreshToken: typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('accessToken') : false,

  login: async (email: string, password: string) => {
    const res = await apiPost<{
      success: boolean;
      data: { accessToken: string; refreshToken: string; user: AuthUser };
    }>('/auth/login', { email, password });

    const { accessToken, refreshToken, user } = res.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, accessToken, refreshToken, isAuthenticated: true });
  },

  logout: () => {
    const token = get().accessToken;
    if (token) {
      apiPost('/auth/logout', {}, token).catch(() => {});
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },

  setTokens: (access, refresh, user) => {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    set({ user, accessToken: access, refreshToken: refresh, isAuthenticated: true });
  },
}));
