import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { supabase, signIn, signOut, getSession } from '../lib/supabase';
import type { AuthState, User } from '../types';

interface AuthStore extends AuthState {
  setUser: (user: User | null) => void;
  setTokens: (access: string | null, refresh: string | null) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
    try {
      const { data, error } = await signIn(email, password);
      
      if (error) {
        console.error('Login error:', error.message);
        return { success: false, error: error.message };
      }

      if (data?.user && data?.session) {
        const user: User = {
          id: data.user.id,
          email: data.user.email || email,
          createdAt: data.user.created_at || new Date().toISOString(),
        };

        // Store tokens
        await SecureStore.setItemAsync('accessToken', data.session.access_token);
        if (data.session.refresh_token) {
          await SecureStore.setItemAsync('refreshToken', data.session.refresh_token);
        }

        set({
          user,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token || null,
          isAuthenticated: true,
        });

        return { success: true };
      }

      return { success: false, error: 'No user data returned' };
    } catch (err) {
      console.error('Login exception:', err);
      return { success: false, error: 'Login failed. Please try again.' };
    }
  },

  signUp: async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        console.error('Sign up error:', error.message);
        return { success: false, error: error.message };
      }

      if (data?.user) {
        // User created, they may need to verify email
        return { success: true };
      }

      return { success: false, error: 'Sign up failed' };
    } catch (err) {
      console.error('Sign up exception:', err);
      return { success: false, error: 'Sign up failed. Please try again.' };
    }
  },

  logout: async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
    
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  loadStoredAuth: async () => {
    try {
      // Check for existing Supabase session
      const { data, error } = await getSession();

      if (data?.session) {
        const user: User = {
          id: data.session.user.id,
          email: data.session.user.email || '',
          createdAt: data.session.user.created_at || new Date().toISOString(),
        };

        set({
          user,
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token || null,
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      }

      // No session found
      set({ isLoading: false });
    } catch (error) {
      console.error('Error loading stored auth:', error);
      set({ isLoading: false });
    }
  },
}));
