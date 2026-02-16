/**
 * Calendar Store with Persistence
 * 
 * Uses AsyncStorage for persistence with stale-while-revalidate pattern:
 * - Shows cached data immediately on launch
 * - Refreshes in background without blocking UI
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  // Location
  location?: string;
  locationUrl?: string;        // Google Maps link
  // Video conferencing
  videoLink?: string;          // Zoom/Teams/Meet URL
  videoProvider?: 'zoom' | 'teams' | 'meet' | 'webex' | 'other';
  // Dial-in
  dialIn?: string;             // Phone number
  dialInCode?: string;         // Meeting ID/passcode
  // Details
  description?: string;
  attendees?: string[];        // List of attendee names
  organizer?: string;
}

interface CalendarStore {
  events: CalendarEvent[];
  isLoading: boolean;
  isBackgroundRefreshing: boolean;
  lastFetched: number | null;  // Store as timestamp for persistence
  setEvents: (events: CalendarEvent[]) => void;
  addEvent: (event: CalendarEvent) => void;
  removeEvent: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setBackgroundRefreshing: (refreshing: boolean) => void;
  isStale: () => boolean;
  _hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
}

// Stale threshold: 5 minutes
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

// Custom storage with date serialization
const calendarStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(name);
      if (!value) return null;
      
      // Parse and convert date strings back to Date objects
      const parsed = JSON.parse(value);
      if (parsed.state?.events) {
        parsed.state.events = parsed.state.events.map((event: any) => ({
          ...event,
          startTime: new Date(event.startTime),
          endTime: event.endTime ? new Date(event.endTime) : undefined,
        }));
      }
      return JSON.stringify(parsed);
    } catch (e) {
      console.log('[Calendar] Storage get error:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      // Dates are automatically serialized to ISO strings by JSON.stringify
      await AsyncStorage.setItem(name, value);
    } catch (e) {
      console.log('[Calendar] Storage set error:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (e) {
      console.log('[Calendar] Storage remove error:', e);
    }
  },
};

export const useCalendarStore = create<CalendarStore>()(
  persist(
    (set, get) => ({
      events: [],
      isLoading: false,
      isBackgroundRefreshing: false,
      lastFetched: null,
      _hasHydrated: false,

      setEvents: (events) => set({ 
        events, 
        lastFetched: Date.now(),
        isLoading: false,
        isBackgroundRefreshing: false,
      }),

      addEvent: (event) => set((state) => ({
        events: [...state.events, event],
      })),

      removeEvent: (id) => set((state) => ({
        events: state.events.filter((e) => e.id !== id),
      })),

      setLoading: (isLoading) => set({ isLoading }),
      
      setBackgroundRefreshing: (isBackgroundRefreshing) => set({ isBackgroundRefreshing }),

      isStale: () => {
        const { lastFetched } = get();
        if (!lastFetched) return true;
        return Date.now() - lastFetched > STALE_THRESHOLD_MS;
      },

      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),
    }),
    {
      name: 'echo-calendar',
      storage: createJSONStorage(() => calendarStorage),
      // Only persist events and lastFetched timestamp
      partialize: (state) => ({
        events: state.events,
        lastFetched: state.lastFetched,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Clear stale cache from a previous day to prevent ghost events
          const { lastFetched } = state;
          if (lastFetched) {
            const cachedDate = new Date(lastFetched);
            const now = new Date();
            const isSameDay =
              cachedDate.getFullYear() === now.getFullYear() &&
              cachedDate.getMonth() === now.getMonth() &&
              cachedDate.getDate() === now.getDate();
            if (!isSameDay) {
              console.log('[Calendar] Cache is from a previous day — clearing stale events');
              state.setEvents([]);
            }
          }
          state.setHasHydrated(true);
        }
      },
    }
  )
);

// Helper to get today's events
export function getTodayEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  
  return events.filter(
    (event) => event.startTime >= startOfDay && event.startTime < endOfDay
  );
}

// Helper to get upcoming events (next 24 hours)
export function getUpcomingEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  return events.filter(
    (event) => event.startTime >= now && event.startTime < tomorrow
  );
}
