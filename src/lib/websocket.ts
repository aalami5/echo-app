import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import type { WebSocketMessage, Message } from '../types';

// TODO: Replace with actual Gateway WebSocket URL
const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://your-gateway.com/ws';

export function useWebSocket(token: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  
  const { addMessage, updateMessage, setAvatarState, setConnected } = useChatStore();

  const connect = useCallback(() => {
    if (!token) return;

    try {
      ws.current = new WebSocket(`${WS_URL}?token=${token}`);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        setAvatarState('idle');
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        
        // Attempt reconnect after 5 seconds
        reconnectTimeout.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.current.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
    }
  }, [token]);

  const handleMessage = (data: WebSocketMessage) => {
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
            card: data.payload.card,
            streaming: false,
          };
          addMessage(message);
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
        // Heartbeat response
        break;
    }
  };

  const sendMessage = useCallback((text: string, audio?: string, image?: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'message',
      id: Date.now().toString(),
      timestamp: Date.now(),
      payload: {
        text,
        audio,
        image,
      },
    };

    ws.current.send(JSON.stringify(message));
    
    // Add to local messages
    addMessage({
      id: message.id,
      text,
      isFromMe: true,
      timestamp: message.timestamp,
    });
  }, [addMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { sendMessage, disconnect };
}
