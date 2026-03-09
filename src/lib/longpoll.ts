/**
 * Long-Polling Transport
 *
 * Fallback transport for when WebSocket connections are blocked
 * (e.g., hospital Wi-Fi at Sequoia). Polls the gateway for events.
 *
 * Strategy:
 * - Tries the `/poll` endpoint first (long-poll: hangs up to 25s)
 * - If 404, falls back to short-polling `/ping` every 10s
 *   (maintains "connected" state; push events come via other means)
 * - Exponential backoff on errors (2s → 30s max)
 */

import { handleGatewayEvent } from './messageHandler';

const INITIAL_BACKOFF = 2000;
const MAX_BACKOFF = 30000;
const BACKOFF_FACTOR = 2;
const SHORT_POLL_INTERVAL = 10000; // 10s between short polls
const LONG_POLL_TIMEOUT = 30000;   // 30s fetch timeout for long-poll

export type PollMode = 'long' | 'short';

export interface LongPollTransport {
  start(gatewayUrl: string, token: string): void;
  stop(): void;
  isActive(): boolean;
  getPollMode(): PollMode;
}

export function createLongPollTransport(
  onConnected: () => void,
  onDisconnected: () => void,
): LongPollTransport {
  let active = false;
  let abortController: AbortController | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = INITIAL_BACKOFF;
  let pollMode: PollMode = 'long';
  let consecutiveErrors = 0;
  let url = '';
  let authToken = '';

  function clearTimer() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function abortCurrent() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  async function pollOnce(): Promise<void> {
    if (!active) return;

    abortController = new AbortController();
    const baseUrl = url.replace(/\/+$/, '');

    try {
      if (pollMode === 'long') {
        // Try long-poll endpoint
        const resp = await fetch(
          `${baseUrl}/poll?token=${encodeURIComponent(authToken)}&timeout=25`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: abortController.signal,
          },
        );

        if (resp.status === 404) {
          // Endpoint doesn't exist yet — downgrade to short-polling
          console.log('[LongPoll] /poll returned 404, switching to short-poll mode');
          pollMode = 'short';
          onConnected(); // still "connected" via HTTP
          scheduleNext(SHORT_POLL_INTERVAL);
          return;
        }

        if (!resp.ok) {
          throw new Error(`Poll returned ${resp.status}`);
        }

        const body = await resp.json();

        // Reset backoff on success
        consecutiveErrors = 0;
        backoff = INITIAL_BACKOFF;
        onConnected();

        // Process events array
        if (body.events && Array.isArray(body.events)) {
          for (const event of body.events) {
            handleGatewayEvent(event);
          }
        }

        // Immediately re-poll
        scheduleNext(0);
      } else {
        // Short-poll: just ping to confirm connectivity
        const resp = await fetch(`${baseUrl}/ping`, {
          method: 'GET',
          headers: { Accept: '*/*' },
          signal: abortController.signal,
        });

        if (resp.ok) {
          consecutiveErrors = 0;
          backoff = INITIAL_BACKOFF;
          onConnected();
        } else {
          throw new Error(`Ping returned ${resp.status}`);
        }

        scheduleNext(SHORT_POLL_INTERVAL);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Intentional abort (stop() called)
        return;
      }

      consecutiveErrors++;
      console.log(`[LongPoll] Error (${consecutiveErrors}):`, err.message || err);

      if (consecutiveErrors >= 3) {
        onDisconnected();
      }

      // Exponential backoff
      scheduleNext(backoff);
      backoff = Math.min(backoff * BACKOFF_FACTOR, MAX_BACKOFF);
    }
  }

  function scheduleNext(delayMs: number) {
    clearTimer();
    if (!active) return;
    if (delayMs <= 0) {
      // Use setTimeout(0) to avoid stack overflow from sync recursion
      pollTimer = setTimeout(pollOnce, 0);
    } else {
      pollTimer = setTimeout(pollOnce, delayMs);
    }
  }

  return {
    start(gatewayUrl: string, token: string) {
      if (active) return;
      console.log('[LongPoll] Starting');
      active = true;
      url = gatewayUrl;
      authToken = token;
      backoff = INITIAL_BACKOFF;
      consecutiveErrors = 0;
      pollMode = 'long'; // always try long first
      pollOnce();
    },

    stop() {
      if (!active) return;
      console.log('[LongPoll] Stopping');
      active = false;
      abortCurrent();
      clearTimer();
      consecutiveErrors = 0;
    },

    isActive() {
      return active;
    },

    getPollMode() {
      return pollMode;
    },
  };
}
