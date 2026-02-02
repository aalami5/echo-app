import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AuthState, User } from '../types';

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setTokens: (access: string | null, refresh: string | null) => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  setTokens: async (access, refresh) => {
    if (access) {
      await SecureStore.setItemAsync('accessToken', access);
    } else {
      await SecureStore.deleteItemAsync('accessToken');
    }
    if (refresh) {
      await SecureStore.setItemAsync('refreshToken', refresh);
    } else {
      await SecureStore.deleteItemAsync('refreshToken');
    }
    set({ accessToken: access, refreshToken: refresh });
  },

  login: async (email: string, password: string) => {
    // TODO: Implement actual Supabase auth
    console.log('Login attempt:', email);
    
    // Placeholder - will connect to Supabase
    const mockUser: User = {
      id: '1',
      email,
      createdAt: new Date().toISOString(),
    };
    
    set({ 
      user: mockUser, 
      isAuthenticated: true,
      accessToken: 'mock-token',
    });
    
    return true;
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    set({ 
      user: null, 
      accessToken: null, 
      refreshToken: null, 
      isAuthenticated: false 
    });
  },

  loadStoredAuth: async () => {
    try {
      const accessToken = await SecureStore.getItemAsync('accessToken');
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      
      if (accessToken) {
        // TODO: Validate token and fetch user
        set({ 
          accessToken, 
          refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      set({ isLoading: false });
    }
  },
}));
