import { create } from 'zustand';

export type TransportMode = 'websocket' | 'polling' | 'disconnected';

interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessageTime: Date | null;
  error: string | null;
  transportMode: TransportMode;

  // Actions
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setLastMessageTime: (time: Date) => void;
  setError: (error: string | null) => void;
  setTransportMode: (mode: TransportMode) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  isConnecting: false,
  lastMessageTime: null,
  error: null,
  transportMode: 'disconnected' as TransportMode,
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

  setTransportMode: (transportMode) => set({ transportMode }),

  reset: () => set(initialState),
}));
