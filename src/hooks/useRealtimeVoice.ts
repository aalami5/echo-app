/** Live audio is direct WebRTC; native OpenClaw owns context, transcripts and tools. */
import { useSyncExternalStore } from 'react';
import { AppState, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { hasClinicalAudioLease } from '../services/audioOwnership';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWebRtcRuntime, hasWebRtcRuntime } from '../services/realtimeVoice';
import { assistantApi, ACTIVE_VOICE_KEY, closeAbandonedVoice } from '../services/assistant';
import { prepareLiveVoiceAudioRoute, releaseLiveVoiceAudioRoute } from '../services/liveAudioRoute';
type LiveVoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'paused' | 'stopping' | 'unsupported' | 'error';
type VoiceCall = { generation: number; pc?: any; stream?: any; voiceId?: string; conversationId: string; audio?: any; recapReady?: boolean; timers?: ReturnType<typeof setTimeout>[]; stats?: ReturnType<typeof setInterval>; nativeSub?: { remove(): void }; appSub?: { remove(): void } };
// The call outlives screen mounts. Only explicit End, logout or terminal failure closes it.
const listeners = new Set<() => void>();
let snapshot = { status: (hasWebRtcRuntime() ? 'idle' : 'unsupported') as LiveVoiceStatus, error: null as string | null, muted: false, conversationId: 'home', startedAt: 0, speaking: false, level: 0 };
function update(patch: Partial<typeof snapshot>) { snapshot = { ...snapshot, ...patch }; listeners.forEach(fn => fn()); }
const setStatus = (status: LiveVoiceStatus) => update({ status });
const setError = (error: string | null) => update({ error });
const setMuted = (muted: boolean) => update({ muted });
const current: { current: VoiceCall | null } = { current: null };
const generation = { current: 0 };
const stopping: { current: Promise<void> | null } = { current: null };
const stop = async () => {
    if (stopping.current) return stopping.current;
    if (!current.current) return;
    const call = current.current; current.current = null; generation.current++;
    call?.timers?.forEach(clearTimeout); if (call?.stats) clearInterval(call.stats); call?.nativeSub?.remove(); call?.appSub?.remove();
    update({ speaking: false, level: 0 });
    call?.stream?.getTracks?.().forEach((t: any) => t.stop()); call?.pc?.close?.();
    if (call?.audio) { call.audio.srcObject = null; call.audio.remove?.(); }
    setStatus('stopping');
    const work = (async () => {
      try {
        if (call?.voiceId) {
          await assistantApi(`/conversations/${call.conversationId}/voice/${call.voiceId}/close`, {});
          await AsyncStorage.removeItem(ACTIVE_VOICE_KEY);
        }
      } catch { setError('Audio stopped. Server connection cleanup will retry on reconnect; accepted work may continue.'); }
      finally {
        await releaseLiveVoiceAudioRoute().catch(() => {});
        setMuted(false); setStatus(hasWebRtcRuntime() ? 'idle' : 'unsupported'); stopping.current = null;
      }
    })();
    stopping.current = work; return work;
  };
  const start = async (conversationId: string) => {
    if (current.current) return;
    if (hasClinicalAudioLease()) { setError('Finish dictation before starting Live Voice.'); return; }
    const runtime = getWebRtcRuntime(); if (!runtime) throw new Error('Live Voice requires the native Echo app.');
    if (stopping.current) await stopping.current;
    if (current.current || hasClinicalAudioLease()) return;
    const call: VoiceCall = { generation: ++generation.current, conversationId, timers: [] };
    update({ conversationId, startedAt: Date.now(), muted: false, speaking: false, level: 0 });
    current.current = call; setStatus('connecting'); setError(null);
    const active = () => current.current === call && generation.current === call.generation;
    const signalRecapReady = async () => {
      if(!active() || call.recapReady || !call.voiceId || call.pc?.connectionState!=='connected' || snapshot.status==='paused') return;
      call.recapReady=true;
      // Readiness is per logical call, not per screen mount or transient reconnect.
      try {await assistantApi(`/conversations/${conversationId}/voice/${call.voiceId}/ready`,{});} catch { /* Never fail audio or replay a greeting after an uncertain acknowledgement. */ }
    };
    try {
      await closeAbandonedVoice();
      if (!active()) return;
      await prepareLiveVoiceAudioRoute();
      if (!active()) return;
      const stream = await runtime.mediaDevices.getUserMedia({ audio: true });
      if (!active()) { stream.getTracks().forEach((t: any) => t.stop()); return; }
      call.stream = stream;
      const pc = new runtime.RTCPeerConnection(); call.pc = pc;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('No microphone available.');
      if (pc.addTransceiver) pc.addTransceiver(track, { direction: 'sendrecv', streams: [stream] }); else pc.addTrack(track, stream);
      let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
      const pause = () => {
        if (!active()) return;
        stream.getAudioTracks().forEach((t: any) => { t.enabled = false; });
        update({ status: 'paused', muted: true, speaking: false, level: 0 });
      };
      if (Platform.OS === 'ios' && NativeModules.EchoAudioSession) {
        call.nativeSub = new NativeEventEmitter(NativeModules.EchoAudioSession).addListener('EchoAudioSessionEvent', (event: any) => {
          if (['interruption', 'routeLost', 'reset'].includes(event.type)) pause();
        });
      }
      call.appSub = AppState.addEventListener('change', state => {
        if (state === 'active' && active() && pc.connectionState === 'connected' && snapshot.status !== 'paused') {
          setStatus('connected');
        }
      });
      // Audio levels are measured from WebRTC, not inferred from text arrivals.
      let polling = false;
      const energy = new Map<string, { energy: number; duration: number }>();
      call.stats = setInterval(async () => {
        if (!active() || AppState.currentState !== 'active' || polling || !pc.getStats) return;
        polling = true;
        try {
          const reports = await pc.getStats(); let input = 0, output = 0;
          reports.forEach((r: any) => {
            if ((r.kind || r.mediaType) !== 'audio') return;
            if (r.type === 'media-source') input = Math.max(input, Number(r.audioLevel) || 0);
            if (r.type === 'inbound-rtp') {
              let level = Number(r.audioLevel) || 0;
              const previous = energy.get(r.id);
              if (previous && r.totalSamplesDuration > previous.duration && r.totalAudioEnergy >= previous.energy) {
                level = Math.max(level, Math.sqrt((r.totalAudioEnergy - previous.energy) / (r.totalSamplesDuration - previous.duration)));
              }
              if (Number.isFinite(r.totalAudioEnergy) && Number.isFinite(r.totalSamplesDuration)) energy.set(r.id, { energy: r.totalAudioEnergy, duration: r.totalSamplesDuration });
              output = Math.max(output, level);
            }
          });
          if (active()) update({ speaking: snapshot.status === 'connected' && output > 0.005, level: snapshot.status === 'connected' ? Math.min(1, Math.max(snapshot.muted ? 0 : input, output) * 3) : 0 });
        } catch { /* Metering is decorative; failure must never end a call. */ }
        finally { polling = false; }
      }, 180);
      track.onended = () => { if (active()) { void stop(); setError('Microphone disconnected. Start Live Voice again.'); } };
      // Do not open a provider data channel: gateway-control-v1 owns it.
      if (runtime.document?.createElement) {
        call.audio = runtime.document.createElement('audio'); call.audio.autoplay = true;
        pc.ontrack = (event: any) => { if (call.audio) call.audio.srcObject = event.streams[0]; };
      }
      pc.onconnectionstatechange = () => {
        if (!active()) return;
        if (pc.connectionState === 'connected') {
          if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = undefined; }
          if (snapshot.status !== 'paused') setStatus('connected');
          void signalRecapReady();
        }
        if (pc.connectionState === 'disconnected' && !disconnectTimer) {
          if (snapshot.status !== 'paused') setStatus('reconnecting');
          disconnectTimer = setTimeout(() => {
            disconnectTimer = undefined;
            if (active() && pc.connectionState !== 'connected') {
              void stop().then(() => setError('Connection lost. Tap Connect to reconnect; your conversation is saved.'));
            }
          }, 20000);
          call.timers!.push(disconnectTimer);
        }
        if (['failed', 'closed'].includes(pc.connectionState)) {
          void stop().then(() => setError('Connection ended. Tap Connect to reconnect.'));
        }
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
      if (!active() || snapshot.status === 'paused') return;
      await prepareLiveVoiceAudioRoute();
      if (!active()) return;
      const timer = setTimeout(() => { if (active() && pc.connectionState !== 'connected') { void stop(); setError('Voice connection timed out. Your history is safe; try again.'); } }, 20000);
      call.timers!.push(timer);
      // Timer only observes this call; an old call cannot stop its replacement.
      if (pc.connectionState === 'connected') { clearTimeout(timer); if ((snapshot.status as LiveVoiceStatus) !== 'paused') setStatus('connected'); await signalRecapReady(); }
    } catch (e: any) {
      if (active()) { await stop(); setError(e.message || 'Could not connect Live Voice.'); setStatus('error'); }
    }
  };
const toggleMute = () => {
  if (snapshot.status !== 'connected') return;
  const next = !snapshot.muted;
  current.current?.stream?.getAudioTracks?.().forEach((t: any) => { t.enabled = !next; });
  setMuted(next);
};
const resume = async () => {
  const call = current.current;
  if (!call || snapshot.status !== 'paused') return;
  try {
    await prepareLiveVoiceAudioRoute();
    if (current.current !== call) return;
    if (call.pc?.connectionState !== 'connected') { await stop(); setError('Tap Connect to reconnect.'); return; }
    // Resume receiving audio, but keep the microphone muted until explicitly unmuted.
    setStatus('connected'); setError(null);
  } catch { setError('Audio is unavailable. Disconnect and try again.'); }
};
export const liveVoiceSession = { stop, getSnapshot: () => snapshot };
export function useRealtimeVoice(conversationId = 'home') {
  const state = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => snapshot, () => snapshot);
  return { ...state, toggleMute, resume, start: () => start(conversationId), stop,
    isActive: ['connecting', 'connected', 'reconnecting', 'paused', 'stopping'].includes(state.status),
    isConnected: state.status === 'connected', isSupported: state.status !== 'unsupported' };
}
