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
 * Build 17:
 * - Connection splash screen integration
 * - Notification queue support
 * 
 * Build 19:
 * - 30-second quick response timeout for long tasks
 * - Returns __LONG_TASK__ marker when timeout, continues in background
 * - Adds response to chat + sends push when delayed response arrives
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';
import { useConnectionStore } from '../stores/connectionStore';
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

// Global singleton for GatewayService (shared across all useGateway calls)
let globalGatewayService: GatewayService | null = null;
let globalInitPromise: Promise<void> | null = null;

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

interface UseGatewayReturn {
  isConnected: boolean;
  isLoading: boolean;
  pendingMessageIds: Set<string>;
  error: string | null;
  sendMessage: (content: string, requestId?: string) => Promise<string | null>;
  checkConnection: () => Promise<boolean>;
  isMessagePending: (messageId: string) => boolean;
}

export function useGateway(): UseGatewayReturn {
  const { gatewayUrl, gatewayToken } = useSettingsStore();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Per-message loading state: track which message IDs are pending
  const [pendingMessageIds, setPendingMessageIds] = useState<Set<string>>(new Set());
  
  const inFlightRequest = useRef<{ id: string; content: string } | null>(null);
  
  // Request queue: chain promises to serialize requests
  const requestQueueRef = useRef<Promise<string | null>>(Promise.resolve(null));

  // Computed isLoading for backward compatibility
  const isLoading = pendingMessageIds.size > 0;

  // Get connection store actions
  const { setState: setConnectionState } = useConnectionStore();

  // Initialize or update the service when settings change (singleton pattern)
  useEffect(() => {
    let mounted = true;
    
    const initService = async () => {
      // If already initializing, wait for that to complete
      if (globalInitPromise) {
        console.log('[useGateway] Initialization already in progress, waiting...');
        await globalInitPromise;
        // Sync local state with connection store
        const state = useConnectionStore.getState().state;
        setIsConnected(state === 'connected');
        return;
      }
      
      // If already connected with valid service, just sync state
      const currentState = useConnectionStore.getState().state;
      if (currentState === 'connected' && globalGatewayService) {
        console.log('[useGateway] Already connected, syncing state');
        setIsConnected(true);
        return;
      }
      
      // Start initialization (store promise globally to prevent duplicates)
      globalInitPromise = (async () => {
        try {
          // Wait for settings to load from SecureStore
          console.log('[useGateway] Waiting for hydration...');
          setConnectionState('initializing');
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
            setConnectionState('connecting');
            globalGatewayService = new GatewayService({
              baseUrl: url,
              token: token,
              userId: `echo-app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            });
            // Check connection on init
            console.log('[useGateway] Running initial health check...');
            const healthy = await checkConnectionInternal();
            console.log('[useGateway] Initial health check result:', healthy);
            
            // Update connection state
            if (healthy) {
              setConnectionState('connected');
              if (mounted) setIsConnected(true);
            } else {
              setConnectionState('failed', 'Gateway unreachable');
              if (mounted) setIsConnected(false);
            }
          } else {
            console.log('[useGateway] MISSING URL or token, service NOT created');
            globalGatewayService = null;
            if (mounted) {
              setIsConnected(false);
              setError(url ? 'Gateway token not configured' : 'Gateway URL not configured');
            }
            setConnectionState('failed', url ? 'Gateway token not configured' : 'Gateway URL not configured');
          }
        } finally {
          globalInitPromise = null;
        }
      })();
      
      await globalInitPromise;
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

  // Internal check that works during initialization (before React state is set up)
  const checkConnectionInternal = async (): Promise<boolean> => {
    if (!globalGatewayService) {
      return false;
    }
    try {
      return await globalGatewayService.healthCheck();
    } catch {
      return false;
    }
  };

  const checkConnection = useCallback(async (): Promise<boolean> => {
    const { setState: updateConnectionState } = useConnectionStore.getState();
    
    if (!globalGatewayService) {
      setIsConnected(false);
      setNetworkConnected(false);
      setError('Gateway not configured');
      updateConnectionState('failed', 'Gateway not configured');
      return false;
    }

    // Set state to 'connecting' before checking (for retry UI feedback)
    updateConnectionState('connecting');

    try {
      const startTime = Date.now();
      const healthy = await globalGatewayService.healthCheck();
      const latencyMs = Date.now() - startTime;
      
      // Only update connection state based on health check results
      setIsConnected(healthy);
      setNetworkConnected(healthy);
      setError(healthy ? null : 'Gateway unreachable');
      
      // Update connection store
      if (healthy) {
        setLatency(latencyMs);
        updateConnectionState('connected');
      } else {
        updateConnectionState('failed', 'Gateway unreachable');
      }
      
      return healthy;
    } catch (err) {
      setIsConnected(false);
      setNetworkConnected(false);
      setError('Connection failed');
      updateConnectionState('failed', 'Connection failed');
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
    requestId?: string
  ): Promise<string | null> => {
    if (!globalGatewayService) {
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

      const requestPromise = globalGatewayService.sendMessage(content);

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
        
        // Continue waiting for actual response in background
        requestPromise.then(async (response) => {
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
          console.error('[useGateway] Delayed request failed:', err);
          
          // Add error message to chat
          const { addMessage } = useChatStore.getState();
          addMessage({
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: 'Sorry, the request failed after working on it. Please try again.',
            timestamp: new Date().toISOString(),
          });
          
          await scheduleResponseReadyNotification();
          
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
    requestId?: string
  ): Promise<string | null> => {
    // Chain this request to the queue - ensures only one runs at a time
    const result = requestQueueRef.current.then(
      () => sendMessageInternal(content, requestId),
      () => sendMessageInternal(content, requestId) // Also run on rejection
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
