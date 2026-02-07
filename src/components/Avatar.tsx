import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { AvatarState } from '../types';
import { colors, shadows } from '../constants/theme';

interface AvatarProps {
  state: AvatarState;
  size?: number;
  onPress?: () => void;
  isRecording?: boolean;
  audioLevel?: number;
}

export function Avatar({ state, size = 120, onPress, isRecording, audioLevel = 0 }: AvatarProps) {
  // Core animations
  const coreScale = useRef(new Animated.Value(1)).current;
  const coreOpacity = useRef(new Animated.Value(1)).current;
  
  // Ring animations - each ring pulses independently
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.8)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.5)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0.3)).current;

  // Audio-reactive scale for recording
  const audioScale = useRef(new Animated.Value(1)).current;

  // React to audio level during recording
  useEffect(() => {
    if (isRecording && audioLevel > 0) {
      const scale = 1 + (audioLevel * 0.3);
      Animated.spring(audioScale, {
        toValue: scale,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(audioScale, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();
    }
  }, [audioLevel, isRecording]);

  useEffect(() => {
    // Reset all values
    coreScale.setValue(1);
    coreOpacity.setValue(1);
    ring1Scale.setValue(1);
    ring1Opacity.setValue(0.8);
    ring2Scale.setValue(1);
    ring2Opacity.setValue(0.5);
    ring3Scale.setValue(1);
    ring3Opacity.setValue(0.3);

    let animations: Animated.CompositeAnimation[] = [];

    switch (state) {
      case 'idle':
        // Gentle breathing - rings pulse outward in sequence
        animations.push(
          Animated.loop(
            Animated.stagger(400, [
              Animated.sequence([
                Animated.timing(ring1Scale, { toValue: 1.08, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(ring1Scale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(ring2Scale, { toValue: 1.12, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(ring3Scale, { toValue: 1.15, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              ]),
            ])
          )
        );
        // Subtle core pulse
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(coreScale, { toValue: 1.05, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(coreScale, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
          )
        );
        break;

      case 'listening':
        // Active listening - rings expand and brighten
        animations.push(
          Animated.parallel([
            Animated.timing(ring1Opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0.8, duration: 200, useNativeDriver: true }),
            Animated.timing(ring3Opacity, { toValue: 0.6, duration: 200, useNativeDriver: true }),
          ])
        );
        // Pulsing rings while listening
        animations.push(
          Animated.loop(
            Animated.parallel([
              Animated.sequence([
                Animated.timing(ring1Scale, { toValue: 1.15, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
                Animated.timing(ring1Scale, { toValue: 1.05, duration: 600, easing: Easing.in(Easing.ease), useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(ring2Scale, { toValue: 1.25, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 1.1, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(ring3Scale, { toValue: 1.35, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 1.15, duration: 800, easing: Easing.in(Easing.ease), useNativeDriver: true }),
              ]),
            ])
          )
        );
        break;

      case 'thinking':
        // Thinking - same gentle breathing as idle, just in yellow
        animations.push(
          Animated.loop(
            Animated.stagger(400, [
              Animated.sequence([
                Animated.timing(ring1Scale, { toValue: 1.08, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(ring1Scale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(ring2Scale, { toValue: 1.12, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(ring3Scale, { toValue: 1.15, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              ]),
            ])
          )
        );
        // Subtle core pulse
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(coreScale, { toValue: 1.05, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(coreScale, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
          )
        );
        break;

      case 'speaking':
        // Speaking - energetic pulses synced to speech rhythm
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.parallel([
                Animated.timing(coreScale, { toValue: 1.15, duration: 120, useNativeDriver: true }),
                Animated.timing(ring1Scale, { toValue: 1.2, duration: 120, useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 1.25, duration: 140, useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 1.3, duration: 160, useNativeDriver: true }),
              ]),
              Animated.parallel([
                Animated.timing(coreScale, { toValue: 1, duration: 120, useNativeDriver: true }),
                Animated.timing(ring1Scale, { toValue: 1.05, duration: 120, useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 1.08, duration: 140, useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 1.1, duration: 160, useNativeDriver: true }),
              ]),
            ])
          )
        );
        // Bright rings while speaking
        animations.push(
          Animated.parallel([
            Animated.timing(ring1Opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0.7, duration: 150, useNativeDriver: true }),
            Animated.timing(ring3Opacity, { toValue: 0.5, duration: 150, useNativeDriver: true }),
          ])
        );
        break;

      case 'alert':
        // Alert - attention-grabbing pulse
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.parallel([
                Animated.timing(coreScale, { toValue: 1.2, duration: 300, useNativeDriver: true }),
                Animated.timing(ring1Scale, { toValue: 1.3, duration: 300, useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 1.4, duration: 300, useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 1.5, duration: 300, useNativeDriver: true }),
              ]),
              Animated.parallel([
                Animated.timing(coreScale, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(ring1Scale, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 1, duration: 300, useNativeDriver: true }),
              ]),
            ])
          )
        );
        break;
    }

    animations.forEach(a => a.start());

    return () => {
      animations.forEach(a => a.stop());
    };
  }, [state]);

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  // State-based colors
  const stateColor = {
    idle: colors.avatarIdle,
    listening: colors.avatarListening,
    thinking: colors.avatarThinking,
    speaking: colors.avatarSpeaking,
    alert: colors.avatarAlert,
  }[state];

  // Sizes with clear spacing between rings
  const coreSize = size * 0.30;
  const ring1Size = size * 0.50;
  const ring2Size = size * 0.72;
  const ring3Size = size * 0.94;

  // Graduated thickness: inner rings thicker, outer rings thinner
  const ring1Width = 4;
  const ring2Width = 2.5;
  const ring3Width = 1.5;

  return (
    <Pressable onPress={handlePress} style={[styles.container, { width: size * 1.2, height: size * 1.2 }]}>
      {/* Ring 3 (outermost) - thinnest */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: ring3Size,
            height: ring3Size,
            borderRadius: ring3Size / 2,
            borderWidth: ring3Width,
            borderColor: stateColor,
            opacity: ring3Opacity,
            transform: [{ scale: ring3Scale }, { scale: audioScale }],
          },
        ]}
      />

      {/* Ring 2 - medium thickness */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: ring2Size,
            height: ring2Size,
            borderRadius: ring2Size / 2,
            borderWidth: ring2Width,
            borderColor: stateColor,
            opacity: ring2Opacity,
            transform: [{ scale: ring2Scale }, { scale: audioScale }],
          },
        ]}
      />

      {/* Ring 1 (innermost ring) - thickest */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: ring1Size,
            height: ring1Size,
            borderRadius: ring1Size / 2,
            borderWidth: ring1Width,
            borderColor: stateColor,
            opacity: ring1Opacity,
            transform: [{ scale: ring1Scale }, { scale: audioScale }],
          },
        ]}
      />

      {/* Solid bright core */}
      <Animated.View
        style={[
          styles.core,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            backgroundColor: stateColor,
            opacity: coreOpacity,
            transform: [{ scale: coreScale }, { scale: audioScale }],
            ...shadows.glow,
            shadowColor: stateColor,
            shadowRadius: 15,
            shadowOpacity: 0.9,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  core: {
    position: 'absolute',
  },
});
