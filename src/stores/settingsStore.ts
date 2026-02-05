/**
 * Settings Store
 * 
 * Persists user settings including API keys and preferences.
 * Uses expo-secure-store for sensitive data.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { VoiceName } from '../services/elevenlabs';

interface SettingsState {
  // API Keys (stored securely)
  openaiApiKey: string | null;
  elevenlabsApiKey: string | null;
  
  // Voice settings
  voiceName: VoiceName;
  voiceEnabled: boolean;
  autoPlayResponses: boolean;
  
  // Display settings
  hapticFeedback: boolean;
  
  // Gateway settings
  gatewayUrl: string;
  gatewayToken: string | null;
  
  // Actions
  setOpenAIKey: (key: string | null) => void;
  setElevenLabsKey: (key: string | null) => void;
  setVoiceName: (voice: VoiceName) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setAutoPlayResponses: (enabled: boolean) => void;
  setHapticFeedback: (enabled: boolean) => void;
  setGatewayUrl: (url: string) => void;
  setGatewayToken: (token: string | null) => void;
  clearAllKeys: () => void;
}

// Custom storage adapter using SecureStore for persistence
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (e) {
      console.log('[Settings] SecureStore get error:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (e) {
      console.log('[Settings] SecureStore set error:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (e) {
      console.log('[Settings] SecureStore remove error:', e);
    }
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Initial state
      openaiApiKey: null,
      elevenlabsApiKey: null,
      voiceName: 'river',
      voiceEnabled: true,
      autoPlayResponses: true,
      hapticFeedback: true,
      gatewayUrl: process.env.EXPO_PUBLIC_GATEWAY_URL || 'https://compare-horse-those-some.trycloudflare.com',
      gatewayToken: null,
      
      // Actions
      setOpenAIKey: (key) => set({ openaiApiKey: key }),
      setElevenLabsKey: (key) => set({ elevenlabsApiKey: key }),
      setVoiceName: (voice) => set({ voiceName: voice }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
      setAutoPlayResponses: (enabled) => set({ autoPlayResponses: enabled }),
      setHapticFeedback: (enabled) => set({ hapticFeedback: enabled }),
      setGatewayUrl: (url) => set({ gatewayUrl: url }),
      setGatewayToken: (token) => set({ gatewayToken: token }),
      
      clearAllKeys: () => set({
        openaiApiKey: null,
        elevenlabsApiKey: null,
      }),
    }),
    {
      name: 'echo-settings',
      storage: createJSONStorage(() => secureStorage),
      // Only persist sensitive and preference data
      partialize: (state) => ({
        openaiApiKey: state.openaiApiKey,
        elevenlabsApiKey: state.elevenlabsApiKey,
        voiceName: state.voiceName,
        voiceEnabled: state.voiceEnabled,
        autoPlayResponses: state.autoPlayResponses,
        hapticFeedback: state.hapticFeedback,
        gatewayUrl: state.gatewayUrl,
        gatewayToken: state.gatewayToken,
      }),
    }
  )
);
