import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { WebSocketMessage, Message } from '../types';

// Gateway WebSocket URL
// In development: localhost
// In production: your server URL
const getWebSocketUrl = () => {
  // For development, connect to local Gateway
  // The Echo App channel runs on port 8765 by default
  if (__DEV__) {
    // Use your Mac's local IP when testing on device
    // Use localhost when testing on simulator
    return 'ws://localhost:8765';
  }
  
  // Production URL - update when deployed
  return process.env.EXPO_PUBLIC_WS_URL || 'wss://your-gateway.com/ws';
};

export function useWebSocket(token: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const { addMessage, updateMessage, setAvatarState, setConnected } = useChatStore();

  const connect = useCallback(() => {
    if (!token) {
      console.log('[WS] No token, skipping connection');
      return;
    }

    const url = `${getWebSocketUrl()}?token=${encodeURIComponent(token)}`;
    console.log('[WS] Connecting to:', url);

    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
        setAvatarState('idle');
        
        // Start ping interval to keep connection alive
        pingInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
              type: 'ping',
              id: Date.now().toString(),
              timestamp: Date.now(),
              payload: {},
            }));
          }
        }, 30000); // Ping every 30 seconds
      };

      ws.current.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        setConnected(false);
        
        // Clear ping interval
        if (pingInterval.current) {
          clearInterval(pingInterval.current);
          pingInterval.current = null;
        }
        
        // Attempt reconnect after 5 seconds (unless intentional close)
        if (event.code !== 1000) {
          reconnectTimeout.current = setTimeout(() => {
            console.log('[WS] Attempting reconnect...');
            connect();
          }, 5000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('[WS] Error:', error);
      };

      ws.current.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error('[WS] Error parsing message:', error);
        }
      };
    } catch (error) {
      console.error('[WS] Connection error:', error);
      
      // Retry connection
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, [token, setConnected, setAvatarState]);

  const handleMessage = useCallback((data: WebSocketMessage) => {
    console.log('[WS] Received:', data.type);
    
    switch (data.type) {
      case 'message':
        if (data.streaming && !data.final) {
          // Update existing streaming message
          updateMessage(data.id, {
            text: data.payload.text || '',
            streaming: true,
          });
        } else {
          // Add new message or finalize streaming
          const message: Message = {
            id: data.id,
            text: data.payload.text || '',
            isFromMe: false,
            timestamp: data.timestamp,
            audioUrl: data.payload.audio,
            streaming: false,
          };
          
          // Check if this is updating an existing streaming message
          const existingMessage = useChatStore.getState().messages.find(m => m.id === data.id);
          if (existingMessage) {
            updateMessage(data.id, { ...message, streaming: false });
          } else {
            addMessage(message);
          }
        }
        break;
        
      case 'status':
        if (data.payload.state) {
          setAvatarState(data.payload.state);
        }
        break;
        
      case 'typing':
        setAvatarState('thinking');
        break;
        
      case 'pong':
        // Heartbeat response - connection is alive
        break;
        
      case 'error':
        console.error('[WS] Server error:', data.payload.error);
        break;
    }
  }, [addMessage, updateMessage, setAvatarState]);

  const sendMessage = useCallback((text: string, audio?: string, image?: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.error('[WS] Not connected, cannot send message');
      return;
    }

    const messageId = Date.now().toString();
    const timestamp = Date.now();

    const message = {
      type: 'message',
      id: messageId,
      timestamp,
      payload: {
        text,
        audio,
        image,
      },
    };

    console.log('[WS] Sending message:', text.substring(0, 50));
    ws.current.send(JSON.stringify(message));
    
    // Add to local messages immediately (optimistic update)
    addMessage({
      id: messageId,
      text,
      isFromMe: true,
      timestamp,
    });
  }, [addMessage]);

  const disconnect = useCallback(() => {
    console.log('[WS] Disconnecting...');
    
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    
    if (pingInterval.current) {
      clearInterval(pingInterval.current);
      pingInterval.current = null;
    }
    
    if (ws.current) {
      ws.current.close(1000, 'User disconnect');
      ws.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { sendMessage, disconnect, reconnect: connect };
}
