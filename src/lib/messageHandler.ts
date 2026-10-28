/**
 * Shared WebSocket/Polling Message Handler
 *
 * Extracted from websocket.ts so both WebSocket and long-polling
 * transports can process incoming gateway events identically.
 */

import { useChatStore } from '../stores/chatStore';
import { useCalendarStore } from '../stores/calendarStore';
import { usePatientsStore } from '../stores/patientsStore';
import { useWebSocketStore } from '../stores/websocketStore';
import type { Message, AvatarState } from '../types';

/**
 * Process a parsed gateway event object.
 * Safe to call from any transport (WS onmessage, polling response, etc.).
 */
export function handleGatewayEvent(data: any): void {
  const { addMessage, setAvatarState } = useChatStore.getState();
  const { setEvents } = useCalendarStore.getState();
  const { setPendingPatient } = usePatientsStore.getState();
  const { setLastMessageTime } = useWebSocketStore.getState();

  console.log('[Transport] Event:', data.type);
  setLastMessageTime(new Date());

  switch (data.type) {
    case 'message': {
      const msg: Message = {
        id: data.id || Date.now().toString(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toISOString(),
      };
      addMessage(msg);
      break;
    }

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
      if (data.events && Array.isArray(data.events)) {
        console.log('[Transport] Calendar update:', data.events.length, 'events');
        const events = data.events.map((e: any) => ({
          ...e,
          startTime: new Date(e.startTime),
          endTime: e.endTime ? new Date(e.endTime) : undefined,
        }));
        setEvents(events);
      }
      break;

    case 'calendar.sync':
      console.log('[Transport] Calendar sync requested');
      break;

    case 'patient.add':
      console.log('[Transport] Patient data received:', data.patient);
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

    case 'pong':
      // Handled by the WS transport directly (for latency tracking)
      break;

    default:
      console.log('[Transport] Unknown event type:', data.type);
      break;
  }
}
