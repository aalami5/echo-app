/**
 * useCalendar Hook
 * 
 * Manages calendar state and syncing with the Gateway.
 */

import { useState, useCallback, useEffect } from 'react';
import { useCalendarStore, CalendarEvent } from '../stores/calendarStore';
import { useSettingsStore } from '../stores/settingsStore';
import { fetchCalendarEvents } from '../services/calendar';

interface UseCalendarReturn {
  events: CalendarEvent[];
  isLoading: boolean;
  lastFetched: Date | null;
  error: string | null;
  refresh: () => Promise<void>;
  getNextEvent: () => CalendarEvent | null;
  getTodayEvents: () => CalendarEvent[];
}

export function useCalendar(): UseCalendarReturn {
  const { gatewayUrl, gatewayToken } = useSettingsStore();
  const { events, isLoading, lastFetched, setEvents, setLoading } = useCalendarStore();
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gatewayUrl || !gatewayToken) {
      setError('Gateway not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const fetchedEvents = await fetchCalendarEvents(gatewayUrl, gatewayToken, { today: true });
      setEvents(fetchedEvents);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch calendar';
      setError(message);
      console.error('[useCalendar] Error:', message);
    } finally {
      setLoading(false);
    }
  }, [gatewayUrl, gatewayToken, setEvents, setLoading]);

  // Auto-refresh on mount if we have credentials and no recent data
  useEffect(() => {
    if (gatewayUrl && gatewayToken) {
      const shouldRefresh = !lastFetched || 
        (new Date().getTime() - lastFetched.getTime() > 5 * 60 * 1000); // 5 min stale
      
      if (shouldRefresh && events.length === 0) {
        refresh();
      }
    }
  }, [gatewayUrl, gatewayToken]); // Only on credential changes

  const getNextEvent = useCallback((): CalendarEvent | null => {
    const now = new Date();
    
    // Find the next event that hasn't ended yet
    const upcoming = events
      .filter(event => {
        const endTime = event.endTime || event.startTime;
        return endTime > now;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    return upcoming[0] || null;
  }, [events]);

  const getTodayEvents = useCallback((): CalendarEvent[] => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    return events.filter(
      event => event.startTime >= startOfDay && event.startTime < endOfDay
    );
  }, [events]);

  return {
    events,
    isLoading,
    lastFetched,
    error,
    refresh,
    getNextEvent,
    getTodayEvents,
  };
}
