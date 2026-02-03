import { create } from 'zustand';

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
  lastFetched: Date | null;
  setEvents: (events: CalendarEvent[]) => void;
  addEvent: (event: CalendarEvent) => void;
  removeEvent: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useCalendarStore = create<CalendarStore>((set) => ({
  events: [],
  isLoading: false,
  lastFetched: null,

  setEvents: (events) => set({ 
    events, 
    lastFetched: new Date(),
    isLoading: false 
  }),

  addEvent: (event) => set((state) => ({
    events: [...state.events, event],
  })),

  removeEvent: (id) => set((state) => ({
    events: state.events.filter((e) => e.id !== id),
  })),

  setLoading: (isLoading) => set({ isLoading }),
}));

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
