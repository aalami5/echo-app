import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { assistantApi } from '../services/assistant';

export function useAssistantConnection(gatewayUrl: string, gatewayToken: string | null) {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const generation = useRef(0);
  const checkConnection = useCallback(async () => {
    const check = ++generation.current;
    setConnectionStatus('connecting');
    try {
      // The authenticated adapter used by current chat/voice, not old chat state
      // or an unauthenticated landing page that can return a misleading 200.
      const result = await assistantApi('/bootstrap');
      if (!Array.isArray(result?.conversations)) throw new Error('Invalid gateway response');
      if (generation.current === check) setConnectionStatus('connected');
    } catch {
      if (generation.current === check) setConnectionStatus('disconnected');
    }
  }, [gatewayUrl, gatewayToken]);
  useFocusEffect(useCallback(() => {
    void checkConnection();
    return () => { generation.current++; };
  }, [checkConnection]));
  return { connectionStatus, checkConnection };
}
