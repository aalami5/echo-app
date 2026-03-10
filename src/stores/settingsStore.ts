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

// Hydration flag — blocks ALL SecureStore writes until hydration completes.
// This prevents Zustand's initial null state from overwriting real credentials.
let _hydrated = false;

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
      // Block ALL writes until hydration is complete.
      // Before hydration, Zustand has default (null) state — writing it would wipe real data.
      if (!_hydrated) {
        console.warn('[Settings] Blocked SecureStore write before hydration complete');
        return;
      }

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
              console.warn('[Settings] Blocked write that would wipe existing keys');
              return; // Don't overwrite good data with empty state
            }
          }
        }
      } catch {
        // parse failed, proceed with write anyway
      }
      // Write backup first (so if main write crashes, backup survives)
      const opts = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
      await SecureStore.setItemAsync(name + BACKUP_SUFFIX, value, opts);
      await SecureStore.setItemAsync(name, value, opts);
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

// Hardcoded gateway URL fallback
const _HARDCODED_GATEWAY_URL = 'https://echo.oppersmedical.com';

// Obfuscated gateway token — XOR'd with key, assembled at runtime to avoid `strings` extraction
const _getHardcodedToken = (): string => {
  const k = 0x42;
  const d = [
    32,123,116,122,113,38,115,38,112,112,117,33,118,117,32,114,
    118,35,114,116,115,32,119,33,33,112,122,36,33,33,39,114,
    117,116,33,114,116,35,114,36,117,39,116,116,32,114,38,35,
  ];
  return d.map(c => String.fromCharCode(c ^ k)).join('');
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
        // Mark hydration complete — SecureStore writes are now safe
        _hydrated = true;
        console.log('[Settings] Hydration complete, writes unlocked');
        if (state) {
          // Post-hydration validation: restore critical keys from hardcoded fallbacks
          if (!state.gatewayUrl) {
            console.warn('[Settings] gatewayUrl lost — restoring hardcoded fallback');
            state.gatewayUrl = _HARDCODED_GATEWAY_URL;
          }
          if (!state.gatewayToken) {
            const fallbackToken = DEFAULT_GATEWAY_TOKEN || _getHardcodedToken();
            console.warn('[Settings] gatewayToken lost — restoring from fallback');
            state.gatewayToken = fallbackToken;
          }
        }
      },
    }
  )
);
