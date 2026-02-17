/**
 * useGateway Hook
 * 
 * React hook for connecting to the OpenClaw Gateway.
 * Uses HTTP API for reliable communication.
 * 
 * Build 13 fixes:
 * - Request queue to serialize gateway requests (no concurrent sends)
 * - Per-message loading state (pendingMessageIds Set)
 * - Connection health only changes on health check, not message failures
 * 
 * Build 16:
 * - Immediate acknowledgment + push notification on complete
 * - Removed streaming (simpler request/response flow)
 * 
 * Build 19:
 * - 30-second quick response timeout for long tasks
 * - Returns __LONG_TASK__ marker when timeout, continues in background
 * - Adds response to chat + sends push when delayed response arrives
 * 
 * Build 23:
 * - Removed connection splash screen dependencies
 * - Simplified initialization
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';
import { useChatStore } from '../stores/chatStore';
import { GatewayService } from '../services/gateway';
import {
  enqueuePendingGatewayRequest,
  removePendingGatewayRequest,
  registerGatewayBackgroundTask,
} from '../services/gatewayBackground';
import { scheduleResponseReadyNotification, scheduleMessageNotification } from '../services/notifications';

// Special marker returned when request times out but continues in background
export const LONG_TASK_MARKER = '__LONG_TASK__';

// How long to wait before treating as a long task (30 seconds)
const QUICK_RESPONSE_TIMEOUT_MS = 30000;

// Wait for Zustand store to hydrate from SecureStore
const waitForHydration = (): Promise<void> => {
  return new Promise((resolve) => {
    const unsubscribe = useSettingsStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
    // Check if already hydrated
    if (useSettingsStore.persist.hasHydrated()) {
      unsubscribe();
      resolve();
    }
  });
};

export interface ImageData {
  base64: string;      // Base64-encoded image (without data: prefix)
  mimeType: string;    // e.g., 'image/jpeg'
}

interface UseGatewayReturn {
  isConnected: boolean;
  isLoading: boolean;
  pendingMessageIds: Set<string>;
  error: string | null;
  sendMessage: (content: string, requestId?: string, image?: ImageData) => Promise<string | null>;
  checkConnection: () => Promise<boolean>;
  isMessagePending: (messageId: string) => boolean;
}

export function useGateway(): UseGatewayReturn {
  const { gatewayUrl, gatewayToken } = useSettingsStore();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Per-message loading state: track which message IDs are pending
  const [pendingMessageIds, setPendingMessageIds] = useState<Set<string>>(new Set());
  
  const serviceRef = useRef<GatewayService | null>(null);
  const inFlightRequest = useRef<{ id: string; content: string } | null>(null);
  
  // Request queue: chain promises to serialize requests
  const requestQueueRef = useRef<Promise<string | null>>(Promise.resolve(null));

  // Computed isLoading for backward compatibility
  const isLoading = pendingMessageIds.size > 0;

  // Initialize or update the service when settings change
  useEffect(() => {
    let mounted = true;
    
    const initService = async () => {
      // Wait for settings to load from SecureStore
      console.log('[useGateway] Waiting for hydration...');
      await waitForHydration();
      
      if (!mounted) {
        console.log('[useGateway] Component unmounted during hydration, aborting');
        return;
      }
      
      // Get fresh values after hydration
      const { gatewayUrl: url, gatewayToken: token } = useSettingsStore.getState();
      console.log('[useGateway] After hydration:');
      console.log('[useGateway]   URL:', url);
      console.log('[useGateway]   Token:', token ? `present (${token.length} chars)` : 'MISSING');
      
      if (url && token) {
        console.log('[useGateway] Creating GatewayService...');
        serviceRef.current = new GatewayService({
          baseUrl: url,
          token: token,
          userId: `echo-app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        });
        // Check connection on init
        console.log('[useGateway] Running initial health check...');
        const healthy = await checkConnection();
        console.log('[useGateway] Initial health check result:', healthy);
      } else {
        console.log('[useGateway] MISSING URL or token, service NOT created');
        serviceRef.current = null;
        setIsConnected(false);
        setError(url ? 'Gateway token not configured' : 'Gateway URL not configured');
      }
    };
    
    initService();
    
    return () => {
      mounted = false;
    };
  }, [gatewayUrl, gatewayToken]);

  useEffect(() => {
    registerGatewayBackgroundTask();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && inFlightRequest.current) {
        enqueuePendingGatewayRequest({
          id: inFlightRequest.current.id,
          content: inFlightRequest.current.content,
          createdAt: new Date().toISOString(),
          retryCount: 0,
        });
      }
    });

    return () => subscription.remove();
  }, []);

  const { setLatency, setConnected: setNetworkConnected } = useNetworkStore();

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (!serviceRef.current) {
      setIsConnected(false);
      setNetworkConnected(false);
      setError('Gateway not configured');
      return false;
    }

    try {
      const startTime = Date.now();
      const healthy = await serviceRef.current.healthCheck();
      const latencyMs = Date.now() - startTime;
      
      // Only update connection state based on health check results
      setIsConnected(healthy);
      setNetworkConnected(healthy);
      setError(healthy ? null : 'Gateway unreachable');
      
      if (healthy) {
        setLatency(latencyMs);
      }
      
      return healthy;
    } catch (err) {
      setIsConnected(false);
      setNetworkConnected(false);
      setError('Connection failed');
      return false;
    }
  }, [setLatency, setNetworkConnected]);

  // Helper to check if a specific message is pending
  const isMessagePending = useCallback((messageId: string): boolean => {
    return pendingMessageIds.has(messageId);
  }, [pendingMessageIds]);

  // Internal send function (called within the queue)
  // Build 19: Returns LONG_TASK_MARKER if request takes > 30s, continues in background
  const sendMessageInternal = useCallback(async (
    content: string,
    requestId?: string,
    image?: ImageData
  ): Promise<string | null> => {
    if (!serviceRef.current) {
      setError('Gateway not configured');
      return null;
    }

    // Generate a message ID if not provided
    const messageId = requestId || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Add to pending set
    setPendingMessageIds(prev => new Set(prev).add(messageId));
    setError(null);

    try {
      if (requestId) {
        inFlightRequest.current = { id: requestId, content };
      }

      // Build 19: Race between actual request and timeout
      let timedOut = false;
      
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, QUICK_RESPONSE_TIMEOUT_MS);
      });

      const requestPromise = serviceRef.current.sendMessage(
        content,
        [],  // history (empty for now)
        image?.base64,
        image?.mimeType
      );

      // Race: whoever finishes first wins
      const raceResult = await Promise.race([requestPromise, timeoutPromise]);

      if (timedOut) {
        // Timeout won - return marker, but let request continue in background
        console.log('[useGateway] Quick response timeout - continuing in background');
        
        // Remove from pending immediately (stop loading indicator)
        setPendingMessageIds(prev => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        
        // Re-send the request WITHOUT the abort timeout so it can run indefinitely
        const noAbortPromise = serviceRef.current!.sendMessage(
          content,
          [],
          image?.base64,
          image?.mimeType,
          true // noTimeout
        );
        
        // Also ignore the original requestPromise (it may abort, that's fine)
        requestPromise.catch(() => { /* original may abort — ignored */ });
        
        // Continue waiting for the no-abort request in background
        noAbortPromise.then(async (response) => {
          console.log('[useGateway] Delayed response arrived:', response?.length || 0, 'chars');
          
          if (response) {
            // Add response to chat store directly
            const { addMessage } = useChatStore.getState();
            const responseMessageId = `delayed-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            
            addMessage({
              id: responseMessageId,
              role: 'assistant',
              content: response,
              timestamp: new Date().toISOString(),
            });
            
            // Send push notification
            await scheduleMessageNotification(response);
            console.log('[useGateway] Added delayed response to chat + sent push notification');
          }
          
          // Clean up
          if (requestId) {
            await removePendingGatewayRequest(requestId);
            inFlightRequest.current = null;
          }
        }).catch(async (err) => {
          console.error('[useGateway] Delayed request failed, polling for response:', err);
          
          // Fallback: poll for ~2 minutes before giving up
          const pollIntervalMs = 30000;
          const maxPolls = 4; // 4 × 30s = 2 minutes
          const { messages: existingMessages } = useChatStore.getState();
          const existingIds = new Set(existingMessages.map((m: any) => m.id));
          
          let found = false;
          for (let i = 0; i < maxPolls; i++) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            console.log(`[useGateway] Polling for delayed response (${i + 1}/${maxPolls})...`);
            
            // Check if a new assistant message appeared (e.g. via push notification)
            const { messages: currentMessages } = useChatStore.getState();
            const newAssistantMsg = currentMessages.find(
              (m: any) => m.role === 'assistant' && !existingIds.has(m.id)
            );
            if (newAssistantMsg) {
              console.log('[useGateway] Found new assistant message during poll, stopping');
              found = true;
              break;
            }
          }
          
          if (!found) {
            // After polling, show a softer message
            const { addMessage } = useChatStore.getState();
            addMessage({
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: 'This is taking longer than expected. I\'ll notify you when it\'s ready.',
              timestamp: new Date().toISOString(),
            });
            
            await scheduleResponseReadyNotification();
          }
          
          if (requestId) {
            await removePendingGatewayRequest(requestId);
            inFlightRequest.current = null;
          }
        });
        
        return LONG_TASK_MARKER;
      }

      // Normal case: got response within timeout
      const response = raceResult;
      
      // Success: DON'T flip isConnected here
      // Connection state is only determined by health checks

      if (requestId) {
        await removePendingGatewayRequest(requestId);
        inFlightRequest.current = null;
      }

      // If app is backgrounded when response arrives, send push notification
      if (AppState.currentState !== 'active') {
        await scheduleResponseReadyNotification();
      }

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      console.error('[useGateway] Message send error:', message);
      console.error('[useGateway] Full error:', err);
      setError(message);
      
      // DON'T flip isConnected on message send failure
      // Instead, trigger a health check to determine actual connection state
      console.log('[useGateway] Message send failed, triggering health check');
      checkConnection();
      
      if (requestId) {
        if (AppState.currentState === 'active') {
          await removePendingGatewayRequest(requestId);
        }
        inFlightRequest.current = null;
      }
      return null;
    } finally {
      // Remove from pending set (only if not already removed by timeout)
      setPendingMessageIds(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, [checkConnection]);

  // Queue-wrapped sendMessage to serialize requests
  const sendMessage = useCallback(async (
    content: string,
    requestId?: string,
    image?: ImageData
  ): Promise<string | null> => {
    // Chain this request to the queue - ensures only one runs at a time
    const result = requestQueueRef.current.then(
      () => sendMessageInternal(content, requestId, image),
      () => sendMessageInternal(content, requestId, image) // Also run on rejection
    );
    
    // Update the queue reference
    requestQueueRef.current = result;
    
    return result;
  }, [sendMessageInternal]);

  return {
    isConnected,
    isLoading,
    pendingMessageIds,
    error,
    sendMessage,
    checkConnection,
    isMessagePending,
  };
}
