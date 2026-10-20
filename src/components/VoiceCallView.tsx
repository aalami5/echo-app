import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';

type Voice = ReturnType<typeof useRealtimeVoice>;
export function VoiceIconButton({ icon, label, onPress, disabled, selected, danger }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean; selected?: boolean; danger?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, selected: !!selected }}
    disabled={disabled} onPress={onPress} style={[styles.iconButton, selected && { backgroundColor: '#334155' }, danger && { backgroundColor: '#9F2835' }, disabled && { opacity: 0.4 }]}>
    <Ionicons name={icon} size={26} color={danger ? '#FFF' : colors.textPrimary}/>
  </TouchableOpacity>;
}
export function voicePresentation(voice: Pick<Voice, 'status' | 'muted' | 'speaking'>, working: boolean) {
  if (voice.status === 'connecting') return { label: 'Connecting', color: '#F5B95E' };
  if (voice.status === 'reconnecting') return { label: 'Reconnecting', color: '#F5B95E' };
  if (voice.status === 'paused') return { label: 'Call paused', color: '#94A3B8' };
  if (voice.status === 'stopping') return { label: 'Ending call', color: '#94A3B8' };
  if (voice.status !== 'connected') return { label: 'Ready when you are', color: '#68DAD4' };
  if (voice.speaking) return { label: voice.muted ? 'Echo speaking · mic muted' : 'Echo speaking', color: '#B8DBFF' };
  if (working) return { label: voice.muted ? 'Working · mic muted' : 'Working', color: '#B69CFF' };
  if (voice.muted) return { label: 'Microphone muted', color: '#94A3B8' };
  return { label: 'Listening', color: '#68E1D4' };
}
export function VoiceCallView({ visible, title, voice, working, ready, caption, connectionError, onRetry, onText, onMore, onDismiss }: {
  visible: boolean; title: string; voice: Voice; working: boolean; ready: boolean; caption?: string; connectionError?: string | null; onRetry: () => void; onText: () => void; onMore: () => void; onDismiss?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [captions, setCaptions] = useState(false);
  const glow = useRef(new Animated.Value(0.3)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const state = !ready ? { label: connectionError ? 'Connection unavailable' : 'Connecting to Echo', color: '#F5B95E' } : voicePresentation(voice, working);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduceMotion(value); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { alive = false; motion.remove(); app.remove(); };
  }, []);
  useEffect(() => {
    if (!visible || !foreground || reduceMotion || !voice.isActive) { glow.setValue(0.3); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 0.7, duration: 1500, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
    ]));
    animation.start(); return () => animation.stop();
  }, [visible, foreground, reduceMotion, voice.isActive, glow]);
  useEffect(() => {
    const animation = Animated.timing(scale, { toValue: reduceMotion || !foreground ? 1 : 1 + voice.level * 0.15, duration: 160, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [voice.level, reduceMotion, foreground, scale]);
  return <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onText} onDismiss={onDismiss}>
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.header}><Text numberOfLines={2} style={styles.title}>Echo · {title}</Text><VoiceIconButton icon="ellipsis-horizontal" label="More options" onPress={onMore}/></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.center}>
        <View accessible accessibilityLabel={state.label} style={styles.orbArea}>
          {[232, 202, 174].map((size, index) => <Animated.View key={size} style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: state.color, opacity: glow, transform: [{ scale }] }]}/>)}
          <Animated.View style={[styles.core, { backgroundColor: state.color, transform: [{ scale }] }]}>
            <Ionicons name={voice.muted || voice.status === 'paused' ? 'mic-off' : 'pulse'} size={58} color="#0B2336"/>
          </Animated.View>
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.state, { color: state.color }]}>{state.label}</Text>
        {(voice.error || (!ready && connectionError)) && <Text accessibilityRole="alert" style={styles.error}>{voice.error || connectionError}</Text>}
        {!ready && connectionError && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry connection" onPress={onRetry} style={styles.start}><Text style={styles.startText}>Try again</Text></TouchableOpacity>}
        {voice.status === 'paused' && <TouchableOpacity accessibilityRole="button" onPress={() => { void voice.resume(); }} style={styles.start}><Text style={styles.startText}>Resume audio</Text></TouchableOpacity>}
        {ready && !voice.isActive && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Start voice call" disabled={!ready || !voice.isSupported} onPress={() => { void voice.start(); }} style={[styles.start, (!ready || !voice.isSupported) && { opacity: 0.4 }]}><Text style={styles.startText}>{ready ? 'Start call' : 'Connecting to Echo…'}</Text></TouchableOpacity>}
        {captions && <Text style={styles.caption}>{caption ? caption.slice(-400) : 'Spoken replies appear here.'}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={captions ? 'Hide captions' : 'Show captions'} onPress={() => setCaptions(value => !value)} style={styles.captionButton}><Ionicons name="chatbox-ellipses-outline" size={20} color={captions ? colors.primary : colors.textSecondary}/><Text style={styles.small}>Captions</Text></TouchableOpacity>
        <View style={styles.controls}>
          <View style={styles.control}><VoiceIconButton icon={voice.muted ? 'mic-off' : 'mic'} label={voice.muted ? 'Unmute microphone' : 'Mute microphone'} selected={voice.muted} disabled={!voice.isConnected} onPress={voice.toggleMute}/></View>
          <View style={styles.control}><VoiceIconButton icon="chatbubble-outline" label="Switch to text; keep call connected" onPress={onText}/><Text style={styles.small}>Text</Text></View>
          <View style={styles.control}><VoiceIconButton icon="call" label="End voice call" danger disabled={!voice.isActive || voice.status === 'stopping'} onPress={() => { void voice.stop(); }}/><Text style={styles.small}>End call</Text></View>
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { flex: 1, color: colors.textSecondary, fontSize: 18, fontWeight: '500' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },
  orbArea: { height: 250, width: 250, alignItems: 'center', justifyContent: 'center' }, ring: { position: 'absolute', borderWidth: 1.5 },
  core: { width: 146, height: 146, borderRadius: 73, alignItems: 'center', justifyContent: 'center' },
  state: { fontSize: 20, fontWeight: '500', textAlign: 'center', marginTop: 12 },
  error: { color: colors.warning, fontSize: 15, textAlign: 'center', marginTop: 16, lineHeight: 22 },
  start: { backgroundColor: '#68DAD4', borderRadius: 26, paddingHorizontal: 32, paddingVertical: 15, marginTop: 24, minHeight: 50 }, startText: { color: colors.textInverse, fontSize: 17, fontWeight: '600' },
  caption: { color: colors.textSecondary, textAlign: 'center', fontSize: 16, lineHeight: 23, marginTop: 22 },
  footer: { flexShrink: 0, paddingTop: 8 }, controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingVertical: 12 },
  control: { alignItems: 'center', gap: 8, flex: 1 }, iconButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' }, captionButton: { alignSelf: 'center', flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 44, paddingHorizontal: 12 },
});
