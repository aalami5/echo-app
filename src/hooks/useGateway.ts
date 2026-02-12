/**
 * useGateway Hook
 * 
 * React hook for connecting to the OpenClaw Gateway.
 * Uses HTTP API for reliable communication.
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
  error: string | null;
  sendMessage: (content: string, requestId?: string) => Promise<string | null>;
  checkConnection: () => Promise<boolean>;
}

export function useGateway(): UseGatewayReturn {
  const { gatewayUrl, gatewayToken } = useSettingsStore();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const serviceRef = useRef<GatewayService | null>(null);
  const inFlightRequest = useRef<{ id: string; content: string } | null>(null);

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

  const sendMessage = useCallback(async (content: string, requestId?: string): Promise<string | null> => {
    if (!serviceRef.current) {
      setError('Gateway not configured');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (requestId) {
        inFlightRequest.current = { id: requestId, content };
      }

      const response = await serviceRef.current.sendMessage(content);
      setIsConnected(true);

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
      setIsConnected(false);
      if (requestId) {
        if (AppState.currentState === 'active') {
          await removePendingGatewayRequest(requestId);
        }
        inFlightRequest.current = null;
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isConnected,
    isLoading,
    error,
    sendMessage,
    checkConnection,
  };
}
