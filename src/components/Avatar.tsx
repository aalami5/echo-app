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
  const ring1Opacity = useRef(new Animated.Value(0.6)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.4)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;
  const ring3Opacity = useRef(new Animated.Value(0.2)).current;

  // Audio-reactive scale for recording
  const audioScale = useRef(new Animated.Value(1)).current;

  // React to audio level during recording
  useEffect(() => {
    if (isRecording && audioLevel > 0) {
      const scale = 1 + (audioLevel * 0.3); // Scale up to 1.3 based on audio
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
    ring1Opacity.setValue(0.6);
    ring2Scale.setValue(1);
    ring2Opacity.setValue(0.4);
    ring3Scale.setValue(1);
    ring3Opacity.setValue(0.2);

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
            Animated.timing(ring1Opacity, { toValue: 0.9, duration: 200, useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0.7, duration: 200, useNativeDriver: true }),
            Animated.timing(ring3Opacity, { toValue: 0.5, duration: 200, useNativeDriver: true }),
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
        // Thinking - core pulses, rings contract slightly with yellow tint handled by stateColor
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(coreOpacity, { toValue: 0.5, duration: 500, useNativeDriver: true }),
              Animated.timing(coreOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
          )
        );
        // Rings pulse inward/outward rhythmically
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.parallel([
                Animated.timing(ring1Scale, { toValue: 0.95, duration: 400, useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 0.9, duration: 400, useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 0.85, duration: 400, useNativeDriver: true }),
              ]),
              Animated.parallel([
                Animated.timing(ring1Scale, { toValue: 1.1, duration: 400, useNativeDriver: true }),
                Animated.timing(ring2Scale, { toValue: 1.15, duration: 400, useNativeDriver: true }),
                Animated.timing(ring3Scale, { toValue: 1.2, duration: 400, useNativeDriver: true }),
              ]),
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
            Animated.timing(ring1Opacity, { toValue: 0.8, duration: 150, useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0.6, duration: 150, useNativeDriver: true }),
            Animated.timing(ring3Opacity, { toValue: 0.4, duration: 150, useNativeDriver: true }),
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
    idle: colors.avatarIdle,        // Cyan/teal
    listening: colors.avatarListening, // Bright cyan
    thinking: colors.avatarThinking,   // Yellow
    speaking: colors.avatarSpeaking,   // Teal/green
    alert: colors.avatarAlert,         // Orange/red
  }[state];

  const coreSize = size * 0.35;
  const ring1Size = size * 0.55;
  const ring2Size = size * 0.75;
  const ring3Size = size * 0.95;

  return (
    <Pressable onPress={handlePress} style={[styles.container, { width: size * 1.3, height: size * 1.3 }]}>
      {/* Outer glow */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 1.2,
            height: size * 1.2,
            borderRadius: size * 0.6,
            backgroundColor: stateColor,
            opacity: 0.15,
            transform: [{ scale: ring3Scale }],
          },
        ]}
      />

      {/* Ring 3 (outermost) */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: ring3Size,
            height: ring3Size,
            borderRadius: ring3Size / 2,
            borderColor: stateColor,
            opacity: ring3Opacity,
            transform: [{ scale: ring3Scale }, { scale: audioScale }],
          },
        ]}
      />

      {/* Ring 2 */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: ring2Size,
            height: ring2Size,
            borderRadius: ring2Size / 2,
            borderColor: stateColor,
            opacity: ring2Opacity,
            transform: [{ scale: ring2Scale }, { scale: audioScale }],
          },
        ]}
      />

      {/* Ring 1 (innermost ring) */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: ring1Size,
            height: ring1Size,
            borderRadius: ring1Size / 2,
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
            shadowRadius: 20,
            shadowOpacity: 0.8,
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
  glow: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  core: {
    position: 'absolute',
  },
});
