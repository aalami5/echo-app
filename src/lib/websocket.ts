import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useCalendarStore } from '../stores/calendarStore';
import { useWebSocketStore } from '../stores/websocketStore';
import { usePatientsStore } from '../stores/patientsStore';
import type { Message, AvatarState } from '../types';

// Gateway WebSocket URL - will be configurable later
const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:8765';

// Max reconnect attempts before giving up
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 5000;

export function useWebSocket(token: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const { addMessage, setAvatarState, setConnected } = useChatStore();
  const { setEvents } = useCalendarStore();
  const { setConnected: setWsConnected, setConnecting, setLastMessageTime, setError } = useWebSocketStore();
  const { addPatient, setPendingPatient } = usePatientsStore();

  const connect = useCallback(() => {
    if (!token) {
      console.log('[WS] No token, skipping connection');
      return;
    }

    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Already connected');
      return;
    }

    // Don't retry forever
    if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[WS] Max reconnect attempts reached, staying offline');
      setConnected(false);
      return;
    }

    const url = `${WS_URL}?token=${token}`;
    console.log('[WS] Connecting...');

    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('[WS] Connected!');
        setConnected(true);
        setWsConnected(true);
        reconnectAttempts.current = 0; // Reset on successful connection
      };

      ws.current.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason || '(no reason)');
        setConnected(false);
        setWsConnected(false);
        ws.current = null;

        // Only auto-reconnect a few times
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++;
          console.log(`[WS] Will retry (${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS}) in ${RECONNECT_DELAY/1000}s...`);
          reconnectTimeout.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.current.onerror = () => {
        // Just log once, don't spam
        if (reconnectAttempts.current === 0) {
          console.log('[WS] Connection failed - Gateway not reachable');
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WS] Message:', data.type);
          setLastMessageTime(new Date());

          switch (data.type) {
            case 'message':
              const msg: Message = {
                id: data.id || Date.now().toString(),
                role: 'assistant',
                content: data.content,
                timestamp: new Date().toISOString(),
              };
              addMessage(msg);
              break;

            case 'avatar_state':
              setAvatarState(data.state as AvatarState);
              break;

            case 'typing':
              setAvatarState('thinking');
              break;

            case 'done':
              setAvatarState('idle');
              break;

            case 'calendar.update':
              // Receive calendar events from Gateway
              if (data.events && Array.isArray(data.events)) {
                console.log('[WS] Calendar update:', data.events.length, 'events');
                // Convert ISO strings back to Date objects
                const events = data.events.map((e: any) => ({
                  ...e,
                  startTime: new Date(e.startTime),
                  endTime: e.endTime ? new Date(e.endTime) : undefined,
                }));
                setEvents(events);
              }
              break;

            case 'calendar.sync':
              // Gateway is requesting calendar sync
              console.log('[WS] Calendar sync requested');
              break;

            case 'patient.add':
              // Gateway is sending patient data to add
              console.log('[WS] Patient data received:', data.patient);
              if (data.patient) {
                setPendingPatient({
                  name: data.patient.name || '',
                  mrn: data.patient.mrn || '',
                  dob: data.patient.dob || '',
                  room: data.patient.room || '',
                  hospital: data.patient.hospital || 'SEQ',
                  chiefComplaint: data.patient.chiefComplaint || '',
                });
              }
              break;
          }
        } catch (e) {
          console.log('[WS] Failed to parse message');
        }
      };
    } catch (e) {
      console.log('[WS] Failed to create WebSocket');
      setConnected(false);
    }
  }, [token, addMessage, setAvatarState, setConnected]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    reconnectAttempts.current = 0;
  }, []);

  const requestCalendarSync = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('[WS] Requesting calendar sync');
      ws.current.send(JSON.stringify({
        type: 'calendar.sync',
      }));
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

    // Send to server if connected
    if (ws.current?.readyState === WebSocket.OPEN) {
      setAvatarState('listening');
      ws.current.send(JSON.stringify({
        type: 'message',
        content: text,
        audioUri,
      }));
    } else {
      console.log('[WS] Not connected, message saved locally');
      // Could queue for later or show offline indicator
    }
  }, [addMessage, setAvatarState]);

  const retryConnection = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { 
    sendMessage, 
    disconnect, 
    retryConnection,
    requestCalendarSync,
    isConnected: ws.current?.readyState === WebSocket.OPEN 
  };
}
