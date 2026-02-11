/**
 * useCalendar Hook
 * 
 * Implements stale-while-revalidate pattern:
 * - Shows cached data immediately (persisted in calendarStore)
 * - Refreshes in background without blocking UI
 * - Visual indicator shows when background refresh is happening
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useCalendarStore, CalendarEvent } from '../stores/calendarStore';
import { useSettingsStore } from '../stores/settingsStore';
import { fetchCalendarEvents } from '../services/calendar';

interface UseCalendarReturn {
  events: CalendarEvent[];
  isLoading: boolean;
  isBackgroundRefreshing: boolean;
  lastFetched: number | null;
  error: string | null;
  refresh: () => Promise<void>;
  getNextEvent: () => CalendarEvent | null;
  getTodayEvents: () => CalendarEvent[];
}

export function useCalendar(): UseCalendarReturn {
  const { gatewayUrl, gatewayToken } = useSettingsStore();
  const { 
    events, 
    isLoading, 
    isBackgroundRefreshing,
    lastFetched, 
    setEvents, 
    setLoading,
    setBackgroundRefreshing,
    isStale,
    _hasHydrated,
  } = useCalendarStore();
  const [error, setError] = useState<string | null>(null);
  const refreshInProgressRef = useRef(false);

  // Background refresh - doesn't block UI
  const backgroundRefresh = useCallback(async () => {
    if (!gatewayUrl || !gatewayToken) return;
    if (refreshInProgressRef.current) return;
    
    refreshInProgressRef.current = true;
    setBackgroundRefreshing(true);
    setError(null);

    try {
      console.log('[useCalendar] Starting background refresh...');
      const fetchedEvents = await fetchCalendarEvents(gatewayUrl, gatewayToken, { today: true });
      setEvents(fetchedEvents);
      console.log('[useCalendar] Background refresh complete, got', fetchedEvents.length, 'events');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch calendar';
      setError(message);
      console.error('[useCalendar] Background refresh error:', message);
    } finally {
      setBackgroundRefreshing(false);
      refreshInProgressRef.current = false;
    }
  }, [gatewayUrl, gatewayToken, setEvents, setBackgroundRefreshing]);

  // Manual refresh - shows full loading state (for pull-to-refresh)
  const refresh = useCallback(async () => {
    if (!gatewayUrl || !gatewayToken) {
      setError('Gateway not configured');
      return;
    }

    if (refreshInProgressRef.current) return;

    refreshInProgressRef.current = true;
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
      refreshInProgressRef.current = false;
    }
  }, [gatewayUrl, gatewayToken, setEvents, setLoading]);

  // Stale-while-revalidate: show cached data immediately, refresh in background if stale
  useEffect(() => {
    if (!_hasHydrated) return; // Wait for store hydration
    if (!gatewayUrl || !gatewayToken) return;

    // If data is stale, refresh in background (non-blocking!)
    if (isStale()) {
      console.log('[useCalendar] Data is stale, starting background refresh');
      // Use setTimeout to ensure this doesn't block initial render
      setTimeout(() => {
        backgroundRefresh();
      }, 100);
    }
  }, [_hasHydrated, gatewayUrl, gatewayToken, isStale, backgroundRefresh]);

  // Refresh when app comes to foreground (if stale)
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && gatewayUrl && gatewayToken) {
        if (isStale()) {
          console.log('[useCalendar] App foregrounded, data is stale, refreshing...');
          backgroundRefresh();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [gatewayUrl, gatewayToken, isStale, backgroundRefresh]);

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
    isBackgroundRefreshing,
    lastFetched,
    error,
    refresh,
    getNextEvent,
    getTodayEvents,
  };
}
