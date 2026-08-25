/**
 * Live Voice hook for OpenAI Realtime.
 *
 * This is intentionally separate from useVoiceChat, which powers the existing
 * Whisper + ElevenLabs pipeline for dictation-style interactions.
 */

import { useCallback, useRef, useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import {
  createRealtimeVoiceSession,
  getWebRtcRuntime,
  hasWebRtcRuntime,
  RealtimeVoiceName,
} from '../services/realtimeVoice';

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
  const localStream = useRef<any>(null);

  const stop = useCallback(async () => {
    setStatus((current) => current === 'idle' || current === 'unsupported' ? current : 'stopping');

    try {
      if (localStream.current?.getTracks) {
        localStream.current.getTracks().forEach((track: any) => track.stop());
      }
      if (peerConnection.current?.close) {
        peerConnection.current.close();
      }
    } finally {
      localStream.current = null;
      peerConnection.current = null;
      setStatus(hasWebRtcRuntime() ? 'idle' : 'unsupported');
    }
  }, []);

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

      pc.createDataChannel('oai-events');

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
      setStatus('connected');
    } catch (e: any) {
      await stop();
      const message = e?.message || 'Failed to start Live Voice';
      setStatus('error');
      setError(message);
      throw new Error(message);
    }
  }, [gatewayToken, gatewayUrl, stop]);

  return {
    status,
    error,
    isSupported: status !== 'unsupported',
    isConnected: status === 'connected',
    start,
    stop,
  };
}
