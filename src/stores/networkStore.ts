/**
 * Network Status Store
 * 
 * Manages connection quality, latency tracking, and toast notifications.
 */

import { create } from 'zustand';
import type { ConnectionQuality } from '../types';

interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

interface NetworkStore {
  // Connection state
  isConnected: boolean;
  connectionQuality: ConnectionQuality;
  latencyMs: number | null;
  lastPingTime: number | null;
  
  // Toast notifications
  toasts: Toast[];
  
  // Actions
  setConnected: (connected: boolean) => void;
  setLatency: (latencyMs: number) => void;
  updateConnectionQuality: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

// Calculate connection quality from latency
function calculateQuality(latencyMs: number | null, isConnected: boolean): ConnectionQuality {
  if (!isConnected) return 'offline';
  if (latencyMs === null) return 'offline';
  if (latencyMs < 100) return 'excellent';
  if (latencyMs < 300) return 'good';
  return 'poor';
}

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  isConnected: false,
  connectionQuality: 'offline',
  latencyMs: null,
  lastPingTime: null,
  toasts: [],

  setConnected: (isConnected) => {
    set({ isConnected });
    get().updateConnectionQuality();
    
    // Show toast when connection status changes
    if (!isConnected) {
      get().addToast({
        message: 'Connection lost. Trying to reconnect...',
        type: 'warning',
        duration: 5000,
      });
    }
  },

  setLatency: (latencyMs) => {
    set({ latencyMs, lastPingTime: Date.now() });
    get().updateConnectionQuality();
  },

  updateConnectionQuality: () => {
    const { latencyMs, isConnected } = get();
    const newQuality = calculateQuality(latencyMs, isConnected);
    const currentQuality = get().connectionQuality;
    
    if (newQuality !== currentQuality) {
      set({ connectionQuality: newQuality });
      
      // Show toast for quality degradation
      if (newQuality === 'poor' && currentQuality !== 'offline') {
        get().addToast({
          message: 'Slow connection detected',
          type: 'info',
          duration: 3000,
        });
      }
    }
  },

  addToast: (toast) => {
    const id = Date.now().toString();
    const newToast = { ...toast, id };
    set((state) => ({ toasts: [...state.toasts, newToast] }));
    
    // Auto-remove after duration
    if (toast.duration) {
      setTimeout(() => {
        get().removeToast(id);
      }, toast.duration);
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => set({ toasts: [] }),
}));
