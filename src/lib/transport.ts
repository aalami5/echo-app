/**
 * Transport Manager
 *
 * Orchestrates WebSocket (primary) and long-polling (fallback) transports.
 *
 * Behaviour:
 * 1. Always tries WebSocket first.
 * 2. After 3 consecutive WS failures within 60s, auto-switches to polling.
 * 3. While in polling mode, retries WS every 5 minutes.
 * 4. Exposes current mode to the UI via websocketStore.transportMode.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { useChatStore } from '../stores/chatStore';
import { useCalendarStore } from '../stores/calendarStore';
import { useWebSocketStore } from '../stores/websocketStore';
import { usePatientsStore } from '../stores/patientsStore';
import { handleGatewayEvent } from './messageHandler';
import { createLongPollTransport, type LongPollTransport } from './longpoll';
import type { Message, AvatarState } from '../types';

/**
 * Derive the WebSocket URL from the gateway URL in settingsStore.
 * e.g. https://echo.oppersmedical.com -> wss://echo.oppersmedical.com
 *      http://localhost:18789          -> ws://localhost:18789
 */
function getWsUrl(): string {
  const { useSettingsStore } = require('../stores/settingsStore');
  const { gatewayUrl } = useSettingsStore.getState();
  if (!gatewayUrl) return '';
  return gatewayUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_FACTOR = 2;
const PING_INTERVAL = 25000;
const PONG_TIMEOUT = 10000;

// Fallback thresholds
const WS_FAILURE_THRESHOLD = 3;        // consecutive failures before switching
const WS_FAILURE_WINDOW_MS = 60000;    // failures must happen within this window
const WS_RETRY_INTERVAL_MS = 300000;   // 5 min: retry WS when in polling mode

export function useTransport(token: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Failure tracking for fallback
  const wsFailures = useRef<number[]>([]); // timestamps of recent failures
  const wsRetryTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPoll = useRef<LongPollTransport | null>(null);

  const { addMessage, setAvatarState, setConnected } = useChatStore();
  const { setEvents } = useCalendarStore();
  const {
    setConnected: setWsConnected,
    setConnecting,
    setLastMessageTime,
    setError,
    setTransportMode,
  } = useWebSocketStore();
  const { addPatient, setPendingPatient } = usePatientsStore();

  // --- helpers ---

  const clearWsTimers = useCallback(() => {
    if (pingInterval.current) { clearInterval(pingInterval.current); pingInterval.current = null; }
    if (pongTimeout.current) { clearTimeout(pongTimeout.current); pongTimeout.current = null; }
    if (reconnectTimeout.current) { clearTimeout(reconnectTimeout.current); reconnectTimeout.current = null; }
  }, []);

  const getGatewayUrl = useCallback((): string | null => {
    try {
      // Derive HTTP base URL from WS URL for polling
      const { useSettingsStore } = require('../stores/settingsStore');
      const { gatewayUrl } = useSettingsStore.getState();
      return gatewayUrl || null;
    } catch {
      return null;
    }
  }, []);

  // Record a WS failure and check if we should switch to polling
  const recordWsFailure = useCallback(() => {
    const now = Date.now();
    wsFailures.current.push(now);
    // Keep only failures within the window
    wsFailures.current = wsFailures.current.filter(t => now - t < WS_FAILURE_WINDOW_MS);

    if (wsFailures.current.length >= WS_FAILURE_THRESHOLD) {
      console.log(`[Transport] ${WS_FAILURE_THRESHOLD} WS failures in ${WS_FAILURE_WINDOW_MS / 1000}s — switching to polling`);
      switchToPolling();
    }
  }, []);

  // --- polling fallback ---

  const switchToPolling = useCallback(() => {
    // Tear down WS
    clearWsTimers();
    if (ws.current) { ws.current.close(); ws.current = null; }

    const gatewayUrl = getGatewayUrl();
    if (!gatewayUrl || !token) {
      console.log('[Transport] Cannot start polling — no gateway URL or token');
      setTransportMode('disconnected');
      return;
    }

    setTransportMode('polling');

    // Create and start long-poll transport
    if (!longPoll.current) {
      longPoll.current = createLongPollTransport(
        () => {
          // onConnected
          setConnected(true);
          setWsConnected(true);
        },
        () => {
          // onDisconnected
          setConnected(false);
          setWsConnected(false);
        },
      );
    }
    longPoll.current.start(gatewayUrl, token);

    // Schedule periodic WS retry
    if (wsRetryTimer.current) clearInterval(wsRetryTimer.current);
    wsRetryTimer.current = setInterval(() => {
      console.log('[Transport] Attempting WS upgrade from polling mode...');
      attemptWsUpgrade();
    }, WS_RETRY_INTERVAL_MS);
  }, [token, clearWsTimers, getGatewayUrl, setConnected, setWsConnected, setTransportMode]);

  const stopPolling = useCallback(() => {
    if (longPoll.current) { longPoll.current.stop(); }
    if (wsRetryTimer.current) { clearInterval(wsRetryTimer.current); wsRetryTimer.current = null; }
  }, []);

  // Try upgrading back to WebSocket from polling
  const attemptWsUpgrade = useCallback(() => {
    if (!token) return;

    // Token in query param is acceptable: wss:// encrypts the full URL in transit
    const testWs = new WebSocket(`${getWsUrl()}?token=${token}`);
    const upgradeTimeout = setTimeout(() => {
      testWs.close();
    }, 10000);

    testWs.onopen = () => {
      clearTimeout(upgradeTimeout);
      console.log('[Transport] WS upgrade succeeded! Switching back to WebSocket');
      testWs.close(); // close the test socket
      stopPolling();
      wsFailures.current = [];
      setTransportMode('websocket');
      reconnectAttempts.current = 0;
      connectWs(); // open the real connection
    };

    testWs.onerror = () => {
      clearTimeout(upgradeTimeout);
      console.log('[Transport] WS upgrade failed, staying on polling');
      testWs.close();
    };

    testWs.onclose = () => {
      clearTimeout(upgradeTimeout);
    };
  }, [token, stopPolling, setTransportMode]);

  // --- WebSocket connection ---

  const connectWs = useCallback(() => {
    if (!token) {
      console.log('[WS] No token, skipping connection');
      return;
    }

    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }

    // Token in query param is acceptable: wss:// encrypts the full URL in transit
    const url = `${getWsUrl()}?token=${token}`;
    console.log('[WS] Connecting...');

    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('[WS] Connected!');
        setConnected(true);
        setWsConnected(true);
        setTransportMode('websocket');
        reconnectAttempts.current = 0;
        wsFailures.current = []; // clear failure history on success

        // Start heartbeat pings
        if (pingInterval.current) clearInterval(pingInterval.current);
        pingInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            try {
              ws.current.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
              if (pongTimeout.current) clearTimeout(pongTimeout.current);
              pongTimeout.current = setTimeout(() => {
                console.log('[WS] Pong timeout — connection appears dead, reconnecting...');
                if (ws.current) { ws.current.close(); ws.current = null; }
                reconnectAttempts.current = 0;
                connectWs();
              }, PONG_TIMEOUT);
            } catch {
              console.log('[WS] Failed to send ping');
            }
          }
        }, PING_INTERVAL);
      };

      ws.current.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason || '(no reason)');
        setConnected(false);
        setWsConnected(false);
        ws.current = null;

        // Stop heartbeat
        if (pingInterval.current) { clearInterval(pingInterval.current); pingInterval.current = null; }
        if (pongTimeout.current) { clearTimeout(pongTimeout.current); pongTimeout.current = null; }

        // Record failure for fallback logic
        recordWsFailure();

        // If we haven't switched to polling, do normal WS reconnect
        if (useWebSocketStore.getState().transportMode !== 'polling') {
          reconnectAttempts.current++;
          const delay = Math.min(
            INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_FACTOR, reconnectAttempts.current - 1),
            MAX_RECONNECT_DELAY,
          );
          console.log(`[WS] Will retry (#${reconnectAttempts.current}) in ${(delay / 1000).toFixed(1)}s...`);
          reconnectTimeout.current = setTimeout(connectWs, delay);
        }
      };

      ws.current.onerror = () => {
        if (reconnectAttempts.current === 0) {
          console.log('[WS] Connection failed - Gateway not reachable');
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Clear pong timeout on any incoming message
          if (pongTimeout.current) { clearTimeout(pongTimeout.current); pongTimeout.current = null; }

          // Handle pong latency tracking locally
          if (data.type === 'pong' && data.ts) {
            const latency = Date.now() - data.ts;
            console.log('[WS] Pong received, latency:', latency, 'ms');
          }

          // Delegate to shared handler
          handleGatewayEvent(data);
        } catch {
          console.log('[WS] Failed to parse message');
        }
      };
    } catch {
      console.log('[WS] Failed to create WebSocket');
      setConnected(false);
      recordWsFailure();
    }
  }, [token, addMessage, setAvatarState, setConnected, setEvents, setLastMessageTime, setPendingPatient, setWsConnected, setTransportMode, recordWsFailure]);

  const disconnect = useCallback(() => {
    clearWsTimers();
    stopPolling();
    if (ws.current) { ws.current.close(); ws.current = null; }
    reconnectAttempts.current = 0;
    wsFailures.current = [];
    setTransportMode('disconnected');
  }, [clearWsTimers, stopPolling, setTransportMode]);

  const requestCalendarSync = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Requesting calendar sync');
      ws.current.send(JSON.stringify({ type: 'calendar.sync' }));
    } else {
      console.log('[WS] Not connected, cannot request calendar sync');
    }
  }, []);

  const sendMessage = useCallback((text: string, audioUri?: string) => {
    // Add user message to local state immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      audioUri,
    };
    addMessage(userMessage);

    // Send to server if WS is connected
    if (ws.current?.readyState === WebSocket.OPEN) {
      setAvatarState('listening');
      ws.current.send(JSON.stringify({ type: 'message', content: text, audioUri }));
    } else {
      console.log('[Transport] Not connected via WS, message saved locally');
      // In polling mode, messages are sent via HTTP (useGateway), not WS
    }
  }, [addMessage, setAvatarState]);

  const retryConnection = useCallback(() => {
    wsFailures.current = [];
    reconnectAttempts.current = 0;
    stopPolling();
    setTransportMode('websocket');
    connectWs();
  }, [connectWs, stopPolling, setTransportMode]);

  // Connect on mount
  useEffect(() => {
    connectWs();
    return () => disconnect();
  }, [connectWs, disconnect]);

  // Reconnect on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        console.log('[Transport] App foregrounded — checking connection');
        const { transportMode } = useWebSocketStore.getState();

        if (transportMode === 'polling') {
          // In polling mode, attempt WS upgrade on foreground
          attemptWsUpgrade();
        } else {
          // Normal WS reconnect
          reconnectAttempts.current = 0;
          if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            console.log('[WS] Reconnecting after foreground...');
            connectWs();
          }
        }
      }
    });
    return () => subscription.remove();
  }, [connectWs, attemptWsUpgrade]);

  return {
    sendMessage,
    disconnect,
    retryConnection,
    requestCalendarSync,
    isConnected: ws.current?.readyState === WebSocket.OPEN || (longPoll.current?.isActive() ?? false),
  };
}
