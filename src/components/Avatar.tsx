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
  audioLevel?: number;
}

export function Avatar({ 
  state, 
  size = 120, 
  onPress, 
  isRecording = false,
  audioLevel = 0 
}: AvatarProps) {
  // Use separate animated values - some for native, some for JS
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring3Scale = useRef(new Animated.Value(1)).current;

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
  }, [state, isRecording, pulseAnim]);

  // Recording animation - expanding rings
  useEffect(() => {
    if (isRecording) {
      // Main pulse
      const mainPulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );

      // Ring 1
      const ring1 = Animated.loop(
        Animated.sequence([
          Animated.timing(ring1Scale, {
            toValue: 1.4,
            duration: 800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ring1Scale, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );

      // Ring 2
      const ring2 = Animated.loop(
        Animated.sequence([
          Animated.timing(ring2Scale, {
            toValue: 1.5,
            duration: 1000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ring2Scale, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );

      // Ring 3
      const ring3 = Animated.loop(
        Animated.sequence([
          Animated.timing(ring3Scale, {
            toValue: 1.6,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ring3Scale, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );

      mainPulse.start();
      ring1.start();
      ring2.start();
      ring3.start();

      return () => {
        mainPulse.stop();
        ring1.stop();
        ring2.stop();
        ring3.stop();
        scaleAnim.setValue(1);
        ring1Scale.setValue(1);
        ring2Scale.setValue(1);
        ring3Scale.setValue(1);
      };
    }
  }, [isRecording, scaleAnim, ring1Scale, ring2Scale, ring3Scale]);

  // Thinking animation
  useEffect(() => {
    if (state === 'thinking' && !isRecording) {
      const think = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.95,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      think.start();
      return () => think.stop();
    }
  }, [state, isRecording, pulseAnim]);

  // Speaking animation
  useEffect(() => {
    if (state === 'speaking') {
      const speak = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ])
      );
      speak.start();
      return () => speak.stop();
    }
  }, [state, pulseAnim]);

  const handlePress = async () => {
    await Haptics.impactAsync(
      isRecording 
        ? Haptics.ImpactFeedbackStyle.Medium 
        : Haptics.ImpactFeedbackStyle.Heavy
    );
    onPress?.();
  };

  // Combine pulse with audio level for recording
  const activeScale = isRecording ? scaleAnim : pulseAnim;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      disabled={!onPress}
    >
      <View style={[styles.container, { width: size * 2, height: size * 2 }]}>
        {/* Outer glow rings (recording only) */}
        {isRecording && (
          <>
            <Animated.View
              style={[
                styles.glowRing,
                {
                  width: size * 1.6,
                  height: size * 1.6,
                  borderRadius: size * 0.8,
                  transform: [{ scale: ring3Scale }],
                  borderColor: colors.primary,
                  opacity: 0.15,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.glowRing,
                {
                  width: size * 1.4,
                  height: size * 1.4,
                  borderRadius: size * 0.7,
                  transform: [{ scale: ring2Scale }],
                  borderColor: colors.primary,
                  opacity: 0.25,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.glowRing,
                {
                  width: size * 1.2,
                  height: size * 1.2,
                  borderRadius: size * 0.6,
                  transform: [{ scale: ring1Scale }],
                  borderColor: colors.primary,
                  opacity: 0.35,
                },
              ]}
            />
          </>
        )}

        {/* Main avatar */}
        <Animated.View
          style={[
            styles.avatarWrapper,
            {
              width: size,
              height: size,
              transform: [{ scale: activeScale }],
            },
          ]}
        >
          {/* Glow effect */}
          <View
            style={[
              styles.glow,
              {
                width: size * 1.3,
                height: size * 1.3,
                borderRadius: size * 0.65,
                opacity: isRecording ? 0.6 : state === 'thinking' ? 0.5 : 0.3,
                backgroundColor: isRecording 
                  ? colors.primary 
                  : state === 'thinking' 
                    ? colors.avatarThinkingGlow 
                    : colors.primaryGlow,
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
                  backgroundColor: isRecording 
                    ? colors.primaryMuted 
                    : state === 'thinking'
                      ? colors.avatarThinking + '20'
                      : colors.surfaceElevated,
                  borderWidth: isRecording || state === 'thinking' ? 3 : 2,
                  borderColor: isRecording 
                    ? colors.primary 
                    : state === 'thinking'
                      ? colors.avatarThinking
                      : colors.primaryMuted,
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
                  backgroundColor: isRecording 
                    ? colors.primary + '40' 
                    : state === 'thinking'
                      ? colors.avatarThinking + '30'
                      : colors.primarySubtle,
                  borderWidth: isRecording || state === 'thinking' ? 2 : 1,
                  borderColor: isRecording 
                    ? colors.primary 
                    : state === 'thinking'
                      ? colors.avatarThinking
                      : colors.primaryMuted,
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
                  backgroundColor: isRecording 
                    ? colors.primary + '60' 
                    : state === 'thinking'
                      ? colors.avatarThinking + '50'
                      : colors.primaryMuted,
                },
              ]}
            />
            
            {/* Core */}
            <LinearGradient
              colors={isRecording 
                ? [colors.primary, '#FFFFFF', colors.primary]
                : state === 'thinking'
                  ? [colors.avatarThinking, '#FFFDE7', colors.avatarThinking]
                  : [colors.primary, colors.primaryGlow]
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

        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>Listening...</Text>
          </View>
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
    borderWidth: 2,
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
});
