/**
 * Operative Report Sync Service
 *
 * Syncs finalized patient dictations to the Mac mini sync server.
 * Mirrors the patient sync retry/queue behavior.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../stores/settingsStore';
import type { PatientDictation } from '../stores/patientDictationsStore';
import type { TranscriptPart } from '../stores/dictationStore';

// Sync endpoint (Cloudflare tunnel path)
const DEFAULT_SYNC_BASE_URL = 'https://echo.oppersmedical.com';
const SYNC_PATH = '/patients/dictations/sync';
const OUTBOX_KEY = 'operative-dictation-sync-outbox-v1';

// Retry configuration
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 60000;

type SanitizedTranscriptPart = Pick<TranscriptPart, 'id' | 'type' | 'content' | 'timestamp'>;

export type FinalizedDictationPayload = Omit<PatientDictation, 'transcriptParts'> & {
  transcriptParts: SanitizedTranscriptPart[];
};

type DictationSyncPayload = {
  dictations: Record<string, FinalizedDictationPayload>;
};

type DictationSyncOutbox = {
  requestId: string;
  payload: DictationSyncPayload;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

// Pending sync queue; persisted in AsyncStorage so app restarts do not lose reports.
let pendingOutbox: DictationSyncOutbox | null = null;
let syncInProgress = false;
let retryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let outboxLoaded = false;

const generateRequestId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const getSyncEndpoint = (): string => {
  const gatewayUrl = useSettingsStore.getState().gatewayUrl || DEFAULT_SYNC_BASE_URL;
  return `${gatewayUrl.replace(/\/$/, '')}${SYNC_PATH}`;
};

const sanitizeTranscriptParts = (parts: TranscriptPart[]): SanitizedTranscriptPart[] => {
  return parts.map((part) => ({
    id: part.id,
    type: part.type,
    content: part.content,
    timestamp: part.timestamp,
  }));
};

const buildFinalizedDictationsPayload = (
  dictations: Record<string, PatientDictation>
): DictationSyncPayload => {
  const finalized = Object.values(dictations).filter((d) => d.status === 'final');
  const payload: Record<string, FinalizedDictationPayload> = {};

  for (const dictation of finalized) {
    payload[dictation.id] = {
      ...dictation,
      transcriptParts: sanitizeTranscriptParts(dictation.transcriptParts),
    };
  }

  return { dictations: payload };
};

const persistOutbox = async (outbox: DictationSyncOutbox | null): Promise<void> => {
  pendingOutbox = outbox;
  if (!outbox) {
    await AsyncStorage.removeItem(OUTBOX_KEY);
    return;
  }
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
};

const loadOutbox = async (): Promise<DictationSyncOutbox | null> => {
  if (outboxLoaded) return pendingOutbox;
  outboxLoaded = true;
  const raw = await AsyncStorage.getItem(OUTBOX_KEY);
  if (!raw) {
    pendingOutbox = null;
    return null;
  }
  try {
    pendingOutbox = JSON.parse(raw) as DictationSyncOutbox;
  } catch (error) {
    console.warn('[DictationSync] Bad outbox payload; clearing', error);
    pendingOutbox = null;
    await AsyncStorage.removeItem(OUTBOX_KEY);
  }
  return pendingOutbox;
};

const queuePayload = async (payload: DictationSyncPayload): Promise<void> => {
  const now = new Date().toISOString();
  await persistOutbox({
    requestId: generateRequestId(),
    payload,
    attemptCount: 0,
    createdAt: pendingOutbox?.createdAt || now,
    updatedAt: now,
  });
};

/**
 * Sync finalized dictations to server
 */
export const syncFinalizedDictations = async (
  dictations: Record<string, PatientDictation>
): Promise<{ success: boolean; error?: string }> => {
  await loadOutbox();
  const payload = buildFinalizedDictationsPayload(dictations);
  const dictationCount = Object.keys(payload.dictations).length;
  if (dictationCount === 0) {
    await persistOutbox(null);
    return { success: true };
  }

  // Always persist the latest finalized set before attempting network sync.
  await queuePayload(payload);

  // If sync already in progress, it will pick up the latest data
  if (syncInProgress) {
    console.log('[DictationSync] Sync already in progress, queued update');
    return { success: true };
  }

  return performSync();
};

/**
 * Actually perform the sync
 */
const performSync = async (): Promise<{ success: boolean; error?: string }> => {
  await loadOutbox();
  if (!pendingOutbox) {
    return { success: true };
  }

  syncInProgress = true;

  // Get auth token from settings
  const token = useSettingsStore.getState().gatewayToken;

  if (!token) {
    console.log('[DictationSync] No auth token, skipping sync');
    syncInProgress = false;
    return { success: false, error: 'No auth token' };
  }

  try {
    const outbox = pendingOutbox;
    const dictationCount = Object.keys(outbox.payload.dictations).length;
    console.log('[DictationSync] Syncing finalized dictations...', {
      dictationCount,
      requestId: outbox.requestId,
    });

    const response = await fetch(getSyncEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Request-Id': outbox.requestId,
      },
      body: JSON.stringify(outbox.payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sync failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log('[DictationSync] Sync successful:', {
      accepted: result.accepted ?? result.dictationCount ?? dictationCount,
      requestId: outbox.requestId,
    });

    // Clear pending data and reset retry count
    await persistOutbox(null);
    retryCount = 0;
    syncInProgress = false;

    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    return { success: true };
  } catch (error: any) {
    const message = error?.message || String(error);
    console.error('[DictationSync] Sync error:', message);
    syncInProgress = false;
    if (pendingOutbox) {
      await persistOutbox({
        ...pendingOutbox,
        attemptCount: pendingOutbox.attemptCount + 1,
        updatedAt: new Date().toISOString(),
        lastError: message,
      });
    }

    // Schedule retry if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      const delayMs = Math.min(BASE_RETRY_DELAY_MS * 2 ** (retryCount - 1), MAX_RETRY_DELAY_MS);
      console.log(`[DictationSync] Scheduling retry ${retryCount}/${MAX_RETRIES} in ${delayMs}ms`);

      if (retryTimer) {
        clearTimeout(retryTimer);
      }

      retryTimer = setTimeout(() => {
        performSync();
      }, delayMs);
    } else {
      console.error('[DictationSync] Max runtime retries exceeded; durable outbox will retry on next launch/manual sync');
      retryCount = 0;
    }

    return { success: false, error: message };
  }
};

/**
 * Force retry any pending sync
 */
export const retryPendingDictationSync = async (): Promise<{ success: boolean; error?: string }> => {
  await loadOutbox();
  if (pendingOutbox) {
    retryCount = 0;
    return performSync();
  }
  return { success: true };
};

/**
 * Check if there's a pending sync
 */
export const hasPendingDictationSync = (): boolean => {
  return pendingOutbox !== null;
};

/**
 * Get sync status
 */
export const getDictationSyncStatus = (): {
  pending: boolean;
  inProgress: boolean;
  retryCount: number;
} => {
  return {
    pending: pendingOutbox !== null,
    inProgress: syncInProgress,
    retryCount: pendingOutbox?.attemptCount ?? retryCount,
  };
};
