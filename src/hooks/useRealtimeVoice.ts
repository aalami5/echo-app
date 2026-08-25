/**
 * Live Voice hook for OpenAI Realtime.
 *
 * This is intentionally separate from useVoiceChat, which powers the existing
 * Whisper + ElevenLabs pipeline for dictation-style interactions.
 */

import { useCallback, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import {
  askEchoVoiceBridge,
  createRealtimeVoiceSession,
  getWebRtcRuntime,
  hasWebRtcRuntime,
  RealtimeVoiceName,
} from '../services/realtimeVoice';
import { prepareLiveVoiceAudioRoute, releaseLiveVoiceAudioRoute } from '../services/liveAudioRoute';

type LiveVoiceStatus = 'idle' | 'connecting' | 'connected' | 'stopping' | 'unsupported' | 'error';
const ICE_GATHERING_TIMEOUT_MS = 2500;

interface UseRealtimeVoiceResult {
  status: LiveVoiceStatus;
  error: string | null;
  isSupported: boolean;
  isConnected: boolean;
  start: (options?: { voice?: RealtimeVoiceName; instructions?: string }) => Promise<void>;
  stop: () => Promise<void>;
}

const waitForIceGathering = (pc: any): Promise<void> => new Promise((resolve) => {
  if (pc.iceGatheringState === 'complete') {
    resolve();
    return;
  }

  let settled = false;
  const previousHandler = pc.onicegatheringstatechange;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    pc.onicegatheringstatechange = previousHandler || null;
    resolve();
  };

  const timeout = setTimeout(finish, ICE_GATHERING_TIMEOUT_MS);
  pc.onicegatheringstatechange = (event: any) => {
    if (typeof previousHandler === 'function') {
      previousHandler.call(pc, event);
    }
    if (pc.iceGatheringState === 'complete') {
      finish();
    }
  };
});

export function useRealtimeVoice(): UseRealtimeVoiceResult {
  const { gatewayUrl, gatewayToken } = useSettingsStore();
  const [status, setStatus] = useState<LiveVoiceStatus>(() => hasWebRtcRuntime() ? 'idle' : 'unsupported');
  const [error, setError] = useState<string | null>(null);
  const peerConnection = useRef<any>(null);
  const dataChannel = useRef<any>(null);
  const localStream = useRef<any>(null);
  const pendingToolCalls = useRef<Set<string>>(new Set());

  const stop = useCallback(async () => {
    setStatus((current) => current === 'idle' || current === 'unsupported' ? current : 'stopping');

    try {
      await releaseLiveVoiceAudioRoute().catch((e) => {
        console.warn('[RealtimeVoice] Failed to release audio route:', e);
      });
      if (localStream.current?.getTracks) {
        localStream.current.getTracks().forEach((track: any) => track.stop());
      }
      if (peerConnection.current?.close) {
        peerConnection.current.close();
      }
    } finally {
      localStream.current = null;
      dataChannel.current = null;
      pendingToolCalls.current.clear();
      peerConnection.current = null;
      setStatus(hasWebRtcRuntime() ? 'idle' : 'unsupported');
    }
  }, []);

  const sendRealtimeEvent = useCallback((event: Record<string, any>) => {
    const channel = dataChannel.current;
    if (!channel || channel.readyState !== 'open') {
      console.warn('[RealtimeVoice] Data channel is not open for event:', event.type);
      return;
    }
    channel.send(JSON.stringify(event));
  }, []);

  const handleToolCall = useCallback(async (event: any) => {
    const callId = event.call_id || event.item_id || event.item?.call_id;
    const name = event.name || event.item?.name;
    if (name && name !== 'ask_echo') {
      return;
    }
    if (!callId || pendingToolCalls.current.has(callId)) {
      return;
    }

    pendingToolCalls.current.add(callId);
    let request = '';
    try {
      const args = typeof event.arguments === 'string'
        ? JSON.parse(event.arguments || '{}')
        : event.arguments || {};
      request = typeof args.request === 'string' ? args.request : '';

      const answer = await askEchoVoiceBridge({
        baseUrl: gatewayUrl,
        token: gatewayToken || '',
        request,
      });

      sendRealtimeEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: answer,
        },
      });
      sendRealtimeEvent({
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
          instructions: 'Speak this Echo tool result naturally and briefly. Do not mention that a tool was called.',
        },
      });
    } catch (e: any) {
      const message = e?.message || 'Echo voice bridge failed';
      console.error('[RealtimeVoice] Tool call failed:', message);
      sendRealtimeEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: `I could not reach Echo's tools for "${request || 'that request'}": ${message}`,
        },
      });
      sendRealtimeEvent({
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
          instructions: 'Apologize briefly and say Echo could not reach its tools for that request.',
        },
      });
    } finally {
      pendingToolCalls.current.delete(callId);
    }
  }, [gatewayToken, gatewayUrl, sendRealtimeEvent]);

  const handleRealtimeEvent = useCallback((rawMessage: any) => {
    try {
      const data = typeof rawMessage === 'string' ? rawMessage : rawMessage?.data;
      if (typeof data !== 'string') {
        return;
      }
      const event = JSON.parse(data);
      if (event.type === 'response.function_call_arguments.done') {
        void handleToolCall(event);
      }
    } catch (e) {
      console.warn('[RealtimeVoice] Failed to handle realtime event:', e);
    }
  }, [handleToolCall]);

  const start = useCallback(async (options?: { voice?: RealtimeVoiceName; instructions?: string }) => {
    const runtime = getWebRtcRuntime();
    if (!runtime) {
      const message = 'Live Voice needs a native WebRTC build. Rebuild the app after installing react-native-webrtc.';
      setStatus('unsupported');
      setError(message);
      throw new Error(message);
    }
    if (!gatewayToken) {
      const message = 'Gateway token not configured';
      setStatus('error');
      setError(message);
      throw new Error(message);
    }

    await stop();
    setStatus('connecting');
    setError(null);

    try {
      await prepareLiveVoiceAudioRoute();
      const pc = new runtime.RTCPeerConnection();
      peerConnection.current = pc;

      const stream = await runtime.mediaDevices.getUserMedia({ audio: true });
      localStream.current = stream;
      const audioTrack = stream.getAudioTracks?.()[0] || stream.getTracks?.()[0];
      if (!audioTrack) {
        throw new Error('Microphone stream did not include an audio track');
      }

      if (pc.addTransceiver) {
        pc.addTransceiver(audioTrack, { direction: 'sendrecv', streams: [stream] });
      } else {
        pc.addTrack(audioTrack, stream);
      }

      const channel = pc.createDataChannel('oai-events');
      dataChannel.current = channel;
      channel.onmessage = handleRealtimeEvent;
      channel.onerror = (event: any) => {
        console.warn('[RealtimeVoice] Data channel error:', event);
      };

      if (runtime.document?.createElement) {
        const audioElement = runtime.document.createElement('audio');
        audioElement.autoplay = true;
        pc.ontrack = (event: any) => {
          audioElement.srcObject = event.streams[0];
        };
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const localDescription = pc.localDescription || offer;
      if (!localDescription?.sdp?.trim()) {
        throw new Error('WebRTC did not produce an SDP offer');
      }

      const { answerSdp } = await createRealtimeVoiceSession({
        baseUrl: gatewayUrl,
        token: gatewayToken,
        offerSdp: localDescription.sdp,
        voice: options?.voice,
        instructions: options?.instructions,
      });

      const answer = runtime.RTCSessionDescription
        ? new runtime.RTCSessionDescription({ type: 'answer', sdp: answerSdp })
        : { type: 'answer', sdp: answerSdp };
      await pc.setRemoteDescription(answer);
      await prepareLiveVoiceAudioRoute();
      setStatus('connected');
    } catch (e: any) {
      await stop();
      const message = e?.message || 'Failed to start Live Voice';
      setStatus('error');
      setError(message);
      throw new Error(message);
    }
  }, [gatewayToken, gatewayUrl, handleRealtimeEvent, stop]);

  return {
    status,
    error,
    isSupported: status !== 'unsupported',
    isConnected: status === 'connected',
    start,
    stop,
  };
}
