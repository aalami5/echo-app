import { create } from 'zustand';
import type { ChatState, Message, AvatarState } from '../types';

interface ChatStore extends ChatState {
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setAvatarState: (state: AvatarState) => void;
  setConnected: (connected: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isConnected: false,
  avatarState: 'idle',

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    })),

  setAvatarState: (avatarState) => set({ avatarState }),

  setConnected: (isConnected) => set({ isConnected }),

  clearMessages: () => set({ messages: [] }),
}));
