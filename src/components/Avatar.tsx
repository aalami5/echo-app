import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  Easing,
  TouchableOpacity,
  Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, spacing } from '../constants/theme';
import type { AvatarState } from '../types';

interface AvatarProps {
  state: AvatarState;
  size?: number;
  onPress?: () => void;
  isRecording?: boolean;
  audioLevel?: number; // 0-1 for audio reactivity
}

const RING_COUNT = 4;

export function Avatar({ 
  state, 
  size = 120, 
  onPress, 
  isRecording = false,
  audioLevel = 0 
}: AvatarProps) {
  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const ringAnims = useRef(
    Array.from({ length: RING_COUNT }, () => new Animated.Value(1))
  ).current;
  const colorAnim = useRef(new Animated.Value(0)).current;

  // Idle animation - gentle pulse
  useEffect(() => {
    if (state === 'idle' && !isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [state, isRecording]);

  // Recording animation - intense pulsing rings
  useEffect(() => {
    if (isRecording) {
      // Intense glow
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.5,
            duration: 300,
            useNativeDriver: false,
          }),
        ])
      ).start();

      // Expanding rings
      ringAnims.forEach((anim, i) => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1.5 + (i * 0.15),
              duration: 800 + (i * 200),
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
          ])
        ).start();
      });

      // Color shift towards brighter cyan/white
      Animated.loop(
        Animated.sequence([
          Animated.timing(colorAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: false,
          }),
          Animated.timing(colorAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: false,
          }),
        ])
      ).start();

      // Slow rotation
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 8000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      // Reset animations
      glowAnim.setValue(0.3);
      colorAnim.setValue(0);
      rotateAnim.setValue(0);
      ringAnims.forEach(anim => anim.setValue(1));
    }
  }, [isRecording]);

  // Thinking animation
  useEffect(() => {
    if (state === 'thinking') {
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [state]);

  // Speaking animation
  useEffect(() => {
    if (state === 'speaking') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [state]);

  const handlePress = async () => {
    await Haptics.impactAsync(
      isRecording 
        ? Haptics.ImpactFeedbackStyle.Medium 
        : Haptics.ImpactFeedbackStyle.Heavy
    );
    onPress?.();
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Interpolate colors for recording state
  const coreColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.primary, '#FFFFFF'],
  });

  const glowColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.glow, '#5CFFFA'],
  });

  // Audio-reactive scale (when recording)
  const audioScale = 1 + (audioLevel * 0.3);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      disabled={!onPress}
    >
      <View style={[styles.container, { width: size * 2, height: size * 2 }]}>
        {/* Outer glow rings (recording) */}
        {isRecording && ringAnims.map((anim, i) => (
          <Animated.View
            key={`ring-${i}`}
            style={[
              styles.glowRing,
              {
                width: size * 1.8,
                height: size * 1.8,
                borderRadius: size,
                transform: [{ scale: anim }],
                opacity: glowAnim.interpolate({
                  inputRange: [0.3, 1],
                  outputRange: [0.1, 0.4 - (i * 0.08)],
                }),
                borderColor: colors.primary,
                borderWidth: 2 - (i * 0.3),
              },
            ]}
          />
        ))}

        {/* Main avatar container */}
        <Animated.View
          style={[
            styles.avatarWrapper,
            {
              width: size,
              height: size,
              transform: [
                { scale: isRecording ? audioScale : pulseAnim },
                { rotate: rotation },
              ],
            },
          ]}
        >
          {/* Glow effect */}
          <Animated.View
            style={[
              styles.glow,
              {
                width: size * 1.4,
                height: size * 1.4,
                borderRadius: size * 0.7,
                opacity: isRecording ? glowAnim : 0.3,
                backgroundColor: isRecording ? colors.primary : colors.glow,
              },
            ]}
          />

          {/* Avatar rings */}
          <View style={[styles.ringContainer, { width: size, height: size }]}>
            {/* Outer ring */}
            <View
              style={[
                styles.ring,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: isRecording ? colors.primaryMuted : colors.surfaceElevated,
                  borderWidth: isRecording ? 3 : 2,
                  borderColor: isRecording ? colors.primary : colors.primaryMuted,
                },
              ]}
            />
            
            {/* Middle ring */}
            <View
              style={[
                styles.ring,
                {
                  width: size * 0.75,
                  height: size * 0.75,
                  borderRadius: (size * 0.75) / 2,
                  backgroundColor: isRecording ? colors.primary + '40' : colors.primarySubtle,
                  borderWidth: isRecording ? 2 : 1,
                  borderColor: isRecording ? colors.primary : colors.primaryMuted,
                },
              ]}
            />
            
            {/* Inner ring */}
            <View
              style={[
                styles.ring,
                {
                  width: size * 0.5,
                  height: size * 0.5,
                  borderRadius: (size * 0.5) / 2,
                  backgroundColor: isRecording ? colors.primary + '60' : colors.primaryMuted,
                },
              ]}
            />
            
            {/* Core */}
            <LinearGradient
              colors={isRecording 
                ? [colors.primary, '#FFFFFF', colors.primary]
                : [colors.primary, colors.glow]
              }
              style={[
                styles.core,
                {
                  width: size * 0.25,
                  height: size * 0.25,
                  borderRadius: (size * 0.25) / 2,
                },
              ]}
            />
          </View>
        </Animated.View>

        {/* Recording indicator text */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Listening...</Text>
          </View>
        )}

        {/* Tap hint (when idle and interactive) */}
        {!isRecording && onPress && state === 'idle' && (
          <Text style={styles.tapHint}>Tap to talk</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    position: 'absolute',
  },
  glowRing: {
    position: 'absolute',
    borderStyle: 'solid',
  },
  recordingIndicator: {
    position: 'absolute',
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface + 'CC',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    gap: spacing.xs,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  recordingText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  tapHint: {
    position: 'absolute',
    bottom: 10,
    color: colors.textTertiary,
    fontSize: 12,
  },
});
