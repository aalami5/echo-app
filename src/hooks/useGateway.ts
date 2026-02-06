/**
 * useGateway Hook
 * 
 * React hook for connecting to the OpenClaw Gateway.
 * Uses HTTP API for reliable communication.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { GatewayService } from '../services/gateway';

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
  sendMessage: (content: string) => Promise<string | null>;
  checkConnection: () => Promise<boolean>;
}

export function useGateway(): UseGatewayReturn {
  const { gatewayUrl, gatewayToken } = useSettingsStore();
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const serviceRef = useRef<GatewayService | null>(null);

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

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (!serviceRef.current) {
      setIsConnected(false);
      setError('Gateway not configured');
      return false;
    }

    try {
      const healthy = await serviceRef.current.healthCheck();
      setIsConnected(healthy);
      setError(healthy ? null : 'Gateway unreachable');
      return healthy;
    } catch (err) {
      setIsConnected(false);
      setError('Connection failed');
      return false;
    }
  }, []);

  const sendMessage = useCallback(async (content: string): Promise<string | null> => {
    if (!serviceRef.current) {
      setError('Gateway not configured');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await serviceRef.current.sendMessage(content);
      setIsConnected(true);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setError(message);
      setIsConnected(false);
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
