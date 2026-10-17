/** Live audio is direct WebRTC; native OpenClaw owns context, transcripts and tools. */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWebRtcRuntime, hasWebRtcRuntime, RealtimeVoiceName } from '../services/realtimeVoice';
import { assistantApi, ACTIVE_VOICE_KEY, closeAbandonedVoice } from '../services/assistant';
import { prepareLiveVoiceAudioRoute, releaseLiveVoiceAudioRoute } from '../services/liveAudioRoute';
type LiveVoiceStatus = 'idle' | 'connecting' | 'connected' | 'stopping' | 'unsupported' | 'error';
type VoiceCall = { generation: number; pc?: any; stream?: any; voiceId?: string; conversationId: string; audio?: any };
export function useRealtimeVoice(conversationId = 'home') {
  const [status, setStatus] = useState<LiveVoiceStatus>(hasWebRtcRuntime() ? 'idle' : 'unsupported');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const current = useRef<VoiceCall | null>(null);
  const generation = useRef(0);
  const stopping = useRef<Promise<void> | null>(null);
  const stop = useCallback(async () => {
    if (stopping.current) return stopping.current;
    const call = current.current; current.current = null; generation.current++;
    call?.stream?.getTracks?.().forEach((t: any) => t.stop()); call?.pc?.close?.();
    if (call?.audio) { call.audio.srcObject = null; call.audio.remove?.(); }
    setStatus('stopping');
    const work = (async () => {
      try {
        if (call?.voiceId) {
          await assistantApi(`/conversations/${call.conversationId}/voice/${call.voiceId}/close`, {});
          await AsyncStorage.removeItem(ACTIVE_VOICE_KEY);
        }
      } catch { setError('Audio stopped. Server call cleanup will retry on reconnect; accepted work may continue.'); }
      finally {
        await releaseLiveVoiceAudioRoute().catch(() => {});
        setMuted(false); setStatus(hasWebRtcRuntime() ? 'idle' : 'unsupported'); stopping.current = null;
      }
    })();
    stopping.current = work; return work;
  }, []);
  useEffect(() => () => { void stop(); }, [stop]);
  const start = useCallback(async (_options?: { voice?: RealtimeVoiceName; instructions?: string }) => {
    if (current.current) return;
    const runtime = getWebRtcRuntime(); if (!runtime) throw new Error('Live Voice requires the native Echo app.');
    if (stopping.current) await stopping.current;
    const call: VoiceCall = { generation: ++generation.current, conversationId };
    current.current = call; setStatus('connecting'); setError(null);
    const active = () => current.current === call && generation.current === call.generation;
    try {
      await closeAbandonedVoice();
      if (!active()) return;
      await prepareLiveVoiceAudioRoute();
      const stream = await runtime.mediaDevices.getUserMedia({ audio: true });
      if (!active()) { stream.getTracks().forEach((t: any) => t.stop()); return; }
      call.stream = stream;
      const pc = new runtime.RTCPeerConnection(); call.pc = pc;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No microphone available.');
      if (pc.addTransceiver) pc.addTransceiver(track, { direction: 'sendrecv', streams: [stream] }); else pc.addTrack(track, stream);
      track.onended = () => { if (active()) { void stop(); setError('Microphone disconnected. Start Live Voice again.'); } };
      // Do not open a provider data channel: gateway-control-v1 owns it.
      if (runtime.document?.createElement) {
        call.audio = runtime.document.createElement('audio'); call.audio.autoplay = true;
        pc.ontrack = (event: any) => { if (call.audio) call.audio.srcObject = event.streams[0]; };
      }
      pc.onconnectionstatechange = () => {
        if (!active()) return;
        if (pc.connectionState === 'connected') setStatus('connected');
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) { void stop(); setError('Voice connection ended. Your saved conversation is still available.'); }
      };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      await new Promise<void>(resolve => {
        if (pc.iceGatheringState === 'complete') return resolve();
        const timer = setTimeout(() => { pc.onicegatheringstatechange = null; resolve(); }, 2500);
        pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(timer); pc.onicegatheringstatechange = null; resolve(); } };
      });
      if (!active()) return;
      const voice = await assistantApi<{ voiceSessionId: string }>(`/conversations/${conversationId}/voice`, {});
      call.voiceId = voice.voiceSessionId;
      if (!active()) { await assistantApi(`/conversations/${conversationId}/voice/${voice.voiceSessionId}/close`, {}); return; }
      await AsyncStorage.setItem(ACTIVE_VOICE_KEY, JSON.stringify({ conversationId, voiceSessionId: call.voiceId }));
      const { answerSdp } = await assistantApi(`/conversations/${conversationId}/voice/${call.voiceId}/offer`, { sdp: pc.localDescription.sdp });
      if (!active()) return;
      await pc.setRemoteDescription(runtime.RTCSessionDescription ? new runtime.RTCSessionDescription({ type: 'answer', sdp: answerSdp }) : { type: 'answer', sdp: answerSdp });
      await prepareLiveVoiceAudioRoute();
      const timer = setTimeout(() => { if (active() && pc.connectionState !== 'connected') { void stop(); setError('Voice connection timed out. Your history is safe; try again.'); } }, 20000);
      // Timer only observes this call; an old call cannot stop its replacement.
      if (pc.connectionState === 'connected') { clearTimeout(timer); setStatus('connected'); }
    } catch (e: any) {
      if (active()) { await stop(); setError(e.message || 'Could not connect Live Voice.'); setStatus('error'); }
    }
  }, [conversationId, stop]);
  const toggleMute = useCallback(() => {
    setMuted(value => { current.current?.stream?.getAudioTracks?.().forEach((t: any) => { t.enabled = value; }); return !value; });
  }, []);
  return { status, error, muted, toggleMute, start, stop, isConnected: status === 'connected', isSupported: status !== 'unsupported' };
}
