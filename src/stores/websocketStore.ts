import { create } from 'zustand';

interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessageTime: Date | null;
  error: string | null;
  
  // Actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setLastMessageTime: (time: Date) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  isConnecting: false,
  lastMessageTime: null,
  error: null,
};

export const useWebSocketStore = create<WebSocketState>((set) => ({
  ...initialState,
  
  setConnected: (connected) => set({ 
    isConnected: connected, 
    isConnecting: false,
    error: connected ? null : undefined,
  }),
  
  setConnecting: (connecting) => set({ 
    isConnecting: connecting,
  }),
  
  setLastMessageTime: (time) => set({ 
    lastMessageTime: time,
  }),
  
  setError: (error) => set({ 
    error,
    isConnected: false,
    isConnecting: false,
  }),
  
  reset: () => set(initialState),
}));
