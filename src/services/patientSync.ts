/**
 * Patient Sync Service
 * 
 * Handles syncing patient data to the sync server.
 * - Syncs on every add/update/delete
 * - Queues syncs when offline
 * - Retries failed syncs
 */

import { useSettingsStore } from '../stores/settingsStore';

// Sync endpoint
const SYNC_ENDPOINT = 'https://echo.oppersmedical.com/patients/sync';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// Pending sync queue (in-memory, will retry on app restart via store rehydration)
let pendingSyncData: { patients: any; callDays: any; callDayOrder: string[] } | null = null;
let syncInProgress = false;
let retryCount = 0;
let retryTimer: NodeJS.Timeout | null = null;

/**
 * Sync patient data to server
 */
export const syncPatients = async (data: {
  patients: Record<string, any>;
  callDays: Record<string, any>;
  callDayOrder: string[];
}): Promise<{ success: boolean; error?: string }> => {
  // Always update pending data with latest
  pendingSyncData = data;
  
  // If sync already in progress, it will pick up the latest data
  if (syncInProgress) {
    console.log('[PatientSync] Sync already in progress, queued update');
    return { success: true };
  }
  
  return performSync();
};

/**
 * Actually perform the sync
 */
const performSync = async (): Promise<{ success: boolean; error?: string }> => {
  if (!pendingSyncData) {
    return { success: true };
  }
  
  syncInProgress = true;
  
  // Get auth token from settings
  const token = useSettingsStore.getState().gatewayToken;
  
  if (!token) {
    console.log('[PatientSync] No auth token, skipping sync');
    syncInProgress = false;
    return { success: false, error: 'No auth token' };
  }
  
  try {
    console.log('[PatientSync] Syncing...', {
      patients: Object.keys(pendingSyncData.patients).length,
      callDays: Object.keys(pendingSyncData.callDays).length
    });
    
    const response = await fetch(SYNC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(pendingSyncData),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sync failed: ${response.status} ${errorText}`);
    }
    
    const result = await response.json();
    console.log('[PatientSync] Sync successful:', result);
    
    // Clear pending data and reset retry count
    pendingSyncData = null;
    retryCount = 0;
    syncInProgress = false;
    
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('[PatientSync] Sync error:', error.message);
    syncInProgress = false;
    
    // Schedule retry if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`[PatientSync] Scheduling retry ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
      
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      
      retryTimer = setTimeout(() => {
        performSync();
      }, RETRY_DELAY_MS);
    } else {
      console.error('[PatientSync] Max retries exceeded, giving up');
      retryCount = 0;
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * Force retry any pending sync
 */
export const retryPendingSync = async (): Promise<{ success: boolean; error?: string }> => {
  if (pendingSyncData) {
    retryCount = 0;
    return performSync();
  }
  return { success: true };
};

/**
 * Check if there's a pending sync
 */
export const hasPendingSync = (): boolean => {
  return pendingSyncData !== null;
};

/**
 * Get sync status
 */
export const getSyncStatus = (): {
  pending: boolean;
  inProgress: boolean;
  retryCount: number;
} => {
  return {
    pending: pendingSyncData !== null,
    inProgress: syncInProgress,
    retryCount,
  };
};
