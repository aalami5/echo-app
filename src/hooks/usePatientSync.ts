/**
 * usePatientSync Hook
 * 
 * Manages patient data sync to the Gateway server.
 * - Syncs patient data from local store to server
 * - Tracks sync state (loading, last synced, errors)
 * - Auto-syncs periodically (every 5 minutes when app active)
 * - Syncs on app foreground
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { usePatientsStore } from '../stores/patientsStore';
import { useSettingsStore } from '../stores/settingsStore';

// Sync configuration
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SYNC_ENDPOINT_PATH = '/patients/sync';

interface UsePatientSyncReturn {
  isSyncing: boolean;
  lastSynced: Date | null;
  error: string | null;
  patientCount: number;
  syncNow: () => Promise<void>;
}

// Persisted last sync time (survives hook remounts)
let lastSyncedGlobal: Date | null = null;

export function usePatientSync(): UsePatientSyncReturn {
  const { gatewayUrl, gatewayToken } = useSettingsStore();
  const { patients, callDays, callDayOrder } = usePatientsStore();
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(lastSyncedGlobal);
  const [error, setError] = useState<string | null>(null);
  
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const patientCount = Object.keys(patients).length;

  /**
   * Sync patient data to server
   */
  const syncNow = useCallback(async () => {
    if (!gatewayUrl || !gatewayToken) {
      setError('Gateway not configured');
      return;
    }

    if (isSyncing) {
      console.log('[PatientSync] Already syncing, skipping');
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      const syncUrl = `${gatewayUrl}${SYNC_ENDPOINT_PATH}`;
      console.log('[PatientSync] Syncing to:', syncUrl, {
        patients: Object.keys(patients).length,
        callDays: Object.keys(callDays).length,
      });

      const response = await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({
          patients,
          callDays,
          callDayOrder,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Sync failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[PatientSync] Sync successful:', result);

      const now = new Date();
      lastSyncedGlobal = now;
      setLastSynced(now);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync patients';
      setError(message);
      console.error('[PatientSync] Error:', message);
    } finally {
      setIsSyncing(false);
    }
  }, [gatewayUrl, gatewayToken, patients, callDays, callDayOrder, isSyncing]);

  /**
   * Start periodic sync
   */
  const startPeriodicSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    // Only start if configured
    if (!gatewayUrl || !gatewayToken) return;

    console.log('[PatientSync] Starting periodic sync (every 5 min)');
    syncIntervalRef.current = setInterval(() => {
      if (appStateRef.current === 'active') {
        console.log('[PatientSync] Periodic sync triggered');
        syncNow();
      }
    }, SYNC_INTERVAL_MS);
  }, [gatewayUrl, gatewayToken, syncNow]);

  /**
   * Stop periodic sync
   */
  const stopPeriodicSync = useCallback(() => {
    if (syncIntervalRef.current) {
      console.log('[PatientSync] Stopping periodic sync');
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  /**
   * Handle app state changes
   */
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // Sync when app comes to foreground
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[PatientSync] App foregrounded, syncing');
        syncNow();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [syncNow]);

  /**
   * Setup/teardown periodic sync
   */
  useEffect(() => {
    if (gatewayUrl && gatewayToken) {
      startPeriodicSync();
      
      // Initial sync if we haven't synced recently
      const shouldSync = !lastSynced || 
        (new Date().getTime() - lastSynced.getTime() > SYNC_INTERVAL_MS);
      
      if (shouldSync && patientCount > 0) {
        syncNow();
      }
    }

    return () => {
      stopPeriodicSync();
    };
  }, [gatewayUrl, gatewayToken]); // Only on credential changes

  return {
    isSyncing,
    lastSynced,
    error,
    patientCount,
    syncNow,
  };
}
