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
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useNetworkStore } from '../stores/networkStore';
import { GatewayService } from '../services/gateway';
import {
  enqueuePendingGatewayRequest,
  removePendingGatewayRequest,
  registerGatewayBackgroundTask,
} from '../services/gatewayBackground';
import { scheduleMessageNotification } from '../services/notifications';

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
      await waitForHydration();
      
      if (!mounted) return;
      
      // Get fresh values after hydration
      const { gatewayUrl: url, gatewayToken: token } = useSettingsStore.getState();
      console.log('[useGateway] After hydration - URL:', url, 'Token:', token ? 'present' : 'missing');
      
      if (url && token) {
        console.log('[useGateway] Creating GatewayService...');
        serviceRef.current = new GatewayService({
          baseUrl: url,
          token: token,
          userId: 'echo-app-oliver',
        });
        // Check connection on init
        checkConnection();
      } else {
        console.log('[useGateway] Missing URL or token, service not created');
        serviceRef.current = null;
        setIsConnected(false);
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
  const sendMessageInternal = useCallback(async (
    content: string,
    requestId?: string
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

      const response = await serviceRef.current.sendMessage(content);
      
      // Success: DON'T flip isConnected here
      // Connection state is only determined by health checks

      if (requestId) {
        await removePendingGatewayRequest(requestId);
        inFlightRequest.current = null;
      }

      if (AppState.currentState !== 'active') {
        await scheduleMessageNotification(response);
      }

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
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
      // Remove from pending set
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
