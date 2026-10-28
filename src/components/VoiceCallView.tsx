import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/theme';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { VoiceOrb, VoiceOrbMode } from './VoiceOrb';

type Voice = ReturnType<typeof useRealtimeVoice>;
export function VoiceIconButton({ icon, label, onPress, disabled, selected, danger, muted }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean; selected?: boolean; danger?: boolean; muted?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!selected }}
    disabled={disabled} onPress={onPress} style={[styles.iconButton, selected && { backgroundColor: '#334155' }, danger && { backgroundColor: '#9F2835' }, muted && { backgroundColor: '#663F49', borderColor: '#D99AA4', borderWidth: 1 }, disabled && { opacity: 0.4 }]}>
    <Ionicons name={icon} size={26} color={muted ? '#FFD8DE' : danger ? '#FFF' : colors.textPrimary}/>
  </TouchableOpacity>;
}
export function voicePresentation(voice: Pick<Voice, 'status' | 'muted' | 'speaking'>, working: boolean) {
  if (voice.status === 'connecting') return { label: 'Connecting', color: '#F5B95E' };
  if (voice.status === 'reconnecting') return { label: 'Reconnecting', color: '#F5B95E' };
  if (voice.status === 'paused') return { label: 'Audio paused', color: '#94A3B8' };
  if (voice.status === 'stopping') return { label: 'Disconnecting', color: '#94A3B8' };
  if (voice.status !== 'connected') return { label: 'Ready when you are', color: '#68DAD4' };
  if (voice.speaking) return { label: voice.muted ? 'Echo speaking · mic muted' : 'Echo speaking', color: '#B8DBFF' };
  if (working) return { label: voice.muted ? 'Working · mic muted' : 'Working', color: '#B69CFF' };
  if (voice.muted) return { label: 'Microphone muted', color: '#94A3B8' };
  return { label: 'Listening', color: '#68E1D4' };
}
export function VoiceCallView({ visible, title, voice, working, ready, caption, connectionError, onRetry, onText, onMore, onAttach, onHangUp, mediaDisabled, content, draftContent }: {
  visible: boolean; title: string; voice: Voice; working: boolean; ready: boolean; caption?: string; connectionError?: string | null; onRetry: () => void; onText: () => void; onMore: () => void; onAttach?: () => void; onHangUp?: () => void; mediaDisabled?: boolean; content?: React.ReactNode; draftContent?: React.ReactNode;
}) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [captions, setCaptions] = useState(false);
  const state = !ready ? { label: connectionError ? 'Connection unavailable' : 'Connecting to Echo', color: '#F5B95E' } : voicePresentation(voice, working);
  const orbMode: VoiceOrbMode = !ready ? (connectionError ? 'paused' : 'connecting')
    : voice.status === 'connecting' || voice.status === 'reconnecting' ? 'connecting'
    : voice.status === 'paused' || voice.status === 'stopping' ? 'paused'
    : voice.status !== 'connected' ? 'idle'
    : voice.speaking ? 'speaking' : working ? 'working' : voice.muted ? 'muted' : 'listening';
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduceMotion(value); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  if (!visible) return null;
  // Inline within ChatViewport: the original tab bar stays visible and usable.
  return <View testID="voice-inline-view" style={styles.root}>
      <View style={styles.header}><Text numberOfLines={2} style={styles.title}>Echo · {title}</Text><VoiceIconButton icon="ellipsis-horizontal" label="More options" onPress={onMore}/></View>
      {content || <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.center}>
        <View accessible accessibilityLabel={state.label}>
          <VoiceOrb color={state.color} mode={orbMode} level={voice.level} motionEnabled={visible && foreground && !reduceMotion}/>
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.state, { color: state.color }]}>{state.label}</Text>
        {(voice.error || (!ready && connectionError)) && <Text accessibilityRole="alert" style={styles.error}>{voice.error || connectionError}</Text>}
        {!ready && connectionError && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry connection" onPress={onRetry} style={styles.start}><Text style={styles.startText}>Try again</Text></TouchableOpacity>}
        {voice.status === 'paused' && <TouchableOpacity accessibilityRole="button" onPress={() => { void voice.resume(); }} style={styles.start}><Text style={styles.startText}>Resume audio</Text></TouchableOpacity>}
        {ready && !voice.isActive && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Connect to Echo" disabled={!ready || !voice.isSupported} onPress={() => { void voice.start(); }} style={[styles.start, (!ready || !voice.isSupported) && { opacity: 0.4 }]}><Text style={styles.startText}>{ready ? 'Connect' : 'Connecting to Echo…'}</Text></TouchableOpacity>}
        {captions && <Text style={styles.caption}>{caption ? caption.slice(-400) : 'Spoken replies appear here.'}</Text>}
      </ScrollView>}
      <View style={styles.footer}>
        {draftContent}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={captions ? 'Hide captions' : 'Show captions'} onPress={() => setCaptions(value => !value)} style={styles.captionButton}><Ionicons name="chatbox-ellipses-outline" size={20} color={captions ? colors.primary : colors.textSecondary}/><Text style={styles.small}>Captions</Text></TouchableOpacity>
        <View style={styles.controls}>
          <View style={styles.control}><VoiceIconButton icon={voice.muted ? 'mic-off' : 'mic'} label={voice.muted ? 'Unmute microphone' : 'Mute microphone'} selected={voice.muted} muted={voice.muted} disabled={!voice.isConnected} onPress={voice.toggleMute}/></View>
          <View style={styles.control}><VoiceIconButton icon="chatbubble-outline" label="Switch to chat; keep connection active" onPress={onText}/><Text style={styles.small}>Chat</Text></View>
          {onAttach && <View style={styles.control}><VoiceIconButton icon="add" label="Add attachment" disabled={mediaDisabled} onPress={onAttach}/></View>}
          <View style={styles.control}><VoiceIconButton icon="power-outline" label="Hang up" danger disabled={!voice.isActive || voice.status === 'stopping'} onPress={() => { if (onHangUp) onHangUp(); else void voice.stop(); }}/><Text style={styles.small}>Hang up</Text></View>
        </View>
      </View>
    </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: colors.background, paddingHorizontal: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { flex: 1, color: colors.textSecondary, fontSize: 18, fontWeight: '500' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  state: { fontSize: 20, fontWeight: '500', textAlign: 'center', marginTop: 12 },
  error: { color: colors.warning, fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 },
  start: { backgroundColor: '#68DAD4', borderRadius: 26, paddingHorizontal: 32, paddingVertical: 15, marginTop: 24, minHeight: 50 }, startText: { color: colors.textInverse, fontSize: 17, fontWeight: '600' },
  caption: { color: colors.textSecondary, textAlign: 'center', fontSize: 16, lineHeight: 23, marginTop: 22 },
  footer: { flexShrink: 0, paddingTop: 8, paddingBottom: 8 }, controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingVertical: 12 },
  control: { alignItems: 'center', gap: 8, flex: 1 }, iconButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' }, captionButton: { alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 44, paddingHorizontal: 12 },
});
