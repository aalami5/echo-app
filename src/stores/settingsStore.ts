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

// Text scale options
export type TextScale = 'normal' | 'large' | 'xlarge';

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
  textScale: TextScale;
  
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
  setTextScale: (scale: TextScale) => void;
  setGatewayUrl: (url: string) => void;
  setGatewayToken: (token: string | null) => void;
  clearAllKeys: () => void;
}

// Custom storage adapter using SecureStore for persistence
// Uses a backup key to protect against crash-during-write corruption
const BACKUP_SUFFIX = '-backup';

const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await SecureStore.getItemAsync(name);
      if (value) {
        // Validate JSON is parseable before returning
        try {
          JSON.parse(value);
          return value;
        } catch {
          console.warn('[Settings] Primary store corrupted, trying backup...');
        }
      }
      // Primary missing or corrupted — try backup
      const backup = await SecureStore.getItemAsync(name + BACKUP_SUFFIX);
      if (backup) {
        console.log('[Settings] Restored from backup');
        // Repair primary from backup
        await SecureStore.setItemAsync(name, backup).catch(() => {});
        return backup;
      }
      return null;
    } catch (e) {
      console.log('[Settings] SecureStore get error:', e);
      // Last resort: try backup
      try {
        return await SecureStore.getItemAsync(name + BACKUP_SUFFIX);
      } catch {
        return null;
      }
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      // Validate we're not writing all-null state over real data
      try {
        const parsed = JSON.parse(value);
        const state = parsed?.state;
        if (state && !state.openaiApiKey && !state.elevenlabsApiKey && !state.gatewayToken) {
          // All keys null — check if we have existing data we'd be wiping
          const existing = await SecureStore.getItemAsync(name);
          if (existing) {
            const existingState = JSON.parse(existing)?.state;
            if (existingState?.openaiApiKey || existingState?.elevenlabsApiKey || existingState?.gatewayToken) {
              console.warn('[Settings] Blocked write that would wipe existing keys (likely hydration race)');
              return; // Don't overwrite good data with empty state
            }
          }
        }
      } catch {
        // parse failed, proceed with write anyway
      }
      // Write backup first (so if main write crashes, backup survives)
      await SecureStore.setItemAsync(name + BACKUP_SUFFIX, value);
      await SecureStore.setItemAsync(name, value);
    } catch (e) {
      console.log('[Settings] SecureStore set error:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
      await SecureStore.deleteItemAsync(name + BACKUP_SUFFIX);
    } catch (e) {
      console.log('[Settings] SecureStore remove error:', e);
    }
  },
};

// Default gateway config (baked into build)
const DEFAULT_GATEWAY_URL = process.env.EXPO_PUBLIC_GATEWAY_URL || 'https://echo.oppersmedical.com';
const DEFAULT_GATEWAY_TOKEN = process.env.EXPO_PUBLIC_GATEWAY_TOKEN || null;

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
      textScale: 'normal',
      gatewayUrl: DEFAULT_GATEWAY_URL,
      gatewayToken: DEFAULT_GATEWAY_TOKEN,
      
      // Actions
      setOpenAIKey: (key) => set({ openaiApiKey: key }),
      setElevenLabsKey: (key) => set({ elevenlabsApiKey: key }),
      setVoiceName: (voice) => set({ voiceName: voice }),
      setVoiceEnabled: (enabled) => set({ voiceEnabled: enabled }),
      setAutoPlayResponses: (enabled) => set({ autoPlayResponses: enabled }),
      setHapticFeedback: (enabled) => set({ hapticFeedback: enabled }),
      setTextScale: (scale) => set({ textScale: scale }),
      setGatewayUrl: (url) => set({ gatewayUrl: url.trim() }),
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
        textScale: state.textScale,
        gatewayUrl: state.gatewayUrl,
        gatewayToken: state.gatewayToken,
      }),
      // Restore defaults if stored values are null but defaults exist
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (!state.gatewayUrl && DEFAULT_GATEWAY_URL) {
            state.gatewayUrl = DEFAULT_GATEWAY_URL;
          }
          if (!state.gatewayToken && DEFAULT_GATEWAY_TOKEN) {
            state.gatewayToken = DEFAULT_GATEWAY_TOKEN;
          }
        }
      },
    }
  )
);
