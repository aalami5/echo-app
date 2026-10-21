import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export type VoiceOrbMode = 'idle' | 'listening' | 'working' | 'speaking' | 'connecting' | 'paused' | 'muted';

// Original Echo mark: a solid center and three rings, lighter/thinner outward.
// Keep this separate from the clinical Avatar so personal-voice changes stay scoped.
const rings = [
  { diameter: 110, width: 12, opacity: 0.82 },
  { diameter: 158, width: 8, opacity: 0.52 },
  { diameter: 206, width: 6, opacity: 0.30 },
];

export function VoiceOrb({ color, mode, level, motionEnabled }: {
  color: string; mode: VoiceOrbMode; level: number; motionEnabled: boolean;
}) {
  const phases = useRef(rings.map(() => new Animated.Value(0))).current;
  const audio = useRef(new Animated.Value(1)).current;
  const quiet = mode === 'paused' || mode === 'muted';
  const breathing = mode === 'working' ? 0.10 : mode === 'connecting' ? 0.08 : 0.05;

  useEffect(() => {
    phases.forEach(phase => phase.setValue(0));
    if (!motionEnabled || quiet) return;
    // The original staggered outward breath, without fabricated speech pulses.
    const duration = mode === 'connecting' ? 1000 : mode === 'working' ? 1600 : 2000;
    const animation = Animated.loop(Animated.stagger(350, phases.map(phase => Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(phase, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]))));
    animation.start();
    return () => animation.stop();
  }, [motionEnabled, quiet, mode, phases]);

  useEffect(() => {
    const reactive = motionEnabled && (mode === 'listening' || mode === 'speaking');
    const amplitude = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    if (!reactive) { audio.setValue(1); return; }
    const animation = Animated.timing(audio, { toValue: 1 + amplitude * 0.12, duration: 160, useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => animation.stop();
  }, [motionEnabled, mode, level, audio]);

  return <View testID="original-echo-orb" pointerEvents="none" style={styles.area}>
    {rings.map((ring, index) => <Animated.View key={ring.diameter} style={[styles.ring, {
      width: ring.diameter, height: ring.diameter, borderRadius: ring.diameter / 2,
      borderWidth: ring.width, borderColor: color,
      opacity: phases[index].interpolate({ inputRange: [0, 1], outputRange: [ring.opacity, Math.min(1, ring.opacity + 0.15)] }),
      transform: [{ scale: phases[index].interpolate({ inputRange: [0, 1], outputRange: [1, 1 + breathing] }) }, { scale: audio }],
    }]}/>)}
    <Animated.View style={[styles.core, { backgroundColor: color, shadowColor: color, transform: [{ scale: audio }] }]}/>
  </View>;
}

const styles = StyleSheet.create({
  area: { height: 260, width: 260, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', backgroundColor: 'transparent' },
  core: { width: 62, height: 62, borderRadius: 31, shadowOpacity: 0.45, shadowRadius: 15, shadowOffset: { width: 0, height: 0 } },
});
