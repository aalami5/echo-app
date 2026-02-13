/**
 * Connection Store
 * 
 * Manages gateway connection state for splash screen gating.
 * States: initializing → connecting → connected | failed
 */

import { create } from 'zustand';

export type ConnectionState = 'initializing' | 'connecting' | 'connected' | 'failed';

interface PendingNotification {
  id: string;
  type: 'message' | 'meeting' | 'brief';
  content?: string;
  timestamp: string;
  eventId?: string;
}

interface ConnectionStore {
  // Connection state
  state: ConnectionState;
  error: string | null;
  
  // Minimum splash display time (ms) - prevents jarring flash
  minSplashTimeMs: number;
  splashShownAt: number | null;
  
  // Pending notifications queue
  pendingNotifications: PendingNotification[];
  
  // Actions
  setState: (state: ConnectionState, error?: string) => void;
  markSplashShown: () => void;
  canDismissSplash: () => boolean;
  
  // Notification queue
  queueNotification: (notification: PendingNotification) => void;
  drainNotifications: () => PendingNotification[];
  clearNotifications: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  state: 'initializing',
  error: null,
  minSplashTimeMs: 1500,
  splashShownAt: null,
  pendingNotifications: [],

  setState: (state, error) => {
    set({ state, error: error || null });
  },

  markSplashShown: () => {
    set({ splashShownAt: Date.now() });
  },

  canDismissSplash: () => {
    const { state, splashShownAt, minSplashTimeMs } = get();
    
    // Must be connected
    if (state !== 'connected') return false;
    
    // Must have shown splash for minimum time
    if (!splashShownAt) return true; // No minimum if not tracked
    
    const elapsed = Date.now() - splashShownAt;
    return elapsed >= minSplashTimeMs;
  },

  queueNotification: (notification) => {
    set((s) => ({
      pendingNotifications: [...s.pendingNotifications, notification],
    }));
    console.log('[ConnectionStore] Queued notification:', notification.id);
  },

  drainNotifications: () => {
    const { pendingNotifications } = get();
    set({ pendingNotifications: [] });
    console.log('[ConnectionStore] Drained', pendingNotifications.length, 'notifications');
    return pendingNotifications;
  },

  clearNotifications: () => {
    set({ pendingNotifications: [] });
  },
}));
