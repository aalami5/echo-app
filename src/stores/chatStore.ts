/**
 * Chat Store
 * 
 * Stores conversation history with persistence.
 * Uses expo-secure-store for encrypted local storage.
 * Messages survive app crashes and restarts.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { ChatState, Message, AvatarState } from '../types';

// Maximum messages to persist (prevent storage bloat)
const MAX_PERSISTED_MESSAGES = 100;

interface ChatStore extends ChatState {
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setAvatarState: (state: AvatarState) => void;
  setConnected: (connected: boolean) => void;
  clearMessages: () => void;
}

// Custom storage adapter using SecureStore for persistence
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (e) {
      console.log('[Chat] SecureStore get error:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (e) {
      console.log('[Chat] SecureStore set error:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (e) {
      console.log('[Chat] SecureStore remove error:', e);
    }
  },
};

// Queue for messages that arrive before hydration completes
let _preHydrationQueue: Message[] = [];
let _hydrated = false;

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      messages: [],
      isConnected: false,
      avatarState: 'idle',

      addMessage: (message) => {
        if (!_hydrated) {
          // Store is still hydrating from SecureStore — queue the message
          // so it doesn't get overwritten when hydration completes
          console.log('[Chat] Store not hydrated yet, queuing message:', message.id);
          _preHydrationQueue.push(message);
          return;
        }
        set((state) => {
          const newMessages = [...state.messages, message];
          // Trim to max persisted messages (keep most recent)
          if (newMessages.length > MAX_PERSISTED_MESSAGES) {
            return { messages: newMessages.slice(-MAX_PERSISTED_MESSAGES) };
          }
          return { messages: newMessages };
        });
      },

      updateMessage: (id, updates) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, ...updates } : msg
          ),
        })),

      setAvatarState: (avatarState) => set({ avatarState }),

      setConnected: (isConnected) => set({ isConnected }),

      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: 'echo-chat',
      storage: createJSONStorage(() => secureStorage),
      // Only persist messages, not ephemeral connection state
      partialize: (state) => ({
        messages: state.messages,
      }),
      onRehydrateStorage: () => (state) => {
        _hydrated = true;
        // Flush any messages that arrived before hydration
        if (_preHydrationQueue.length > 0 && state) {
          console.log(`[Chat] Hydration complete, flushing ${_preHydrationQueue.length} queued messages`);
          const currentMessages = state.messages || [];
          const newMessages: Message[] = [];
          for (const msg of _preHydrationQueue) {
            const isDuplicate = currentMessages.some((m) => m.id === msg.id) ||
                                newMessages.some((m) => m.id === msg.id);
            if (!isDuplicate) {
              newMessages.push(msg);
            }
          }
          _preHydrationQueue = [];
          if (newMessages.length > 0) {
            useChatStore.setState((s) => ({
              messages: [...s.messages, ...newMessages].slice(-MAX_PERSISTED_MESSAGES),
            }));
          }
        } else {
          _preHydrationQueue = [];
        }
      },
    }
  )
);

/**
 * Wait for store hydration to complete.
 * Use this before any notification sync that reads messages.
 */
export function waitForHydration(timeoutMs: number = 5000): Promise<void> {
  if (_hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (_hydrated || Date.now() - start > timeoutMs) {
        resolve();
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}
