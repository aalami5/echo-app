import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Text } from 'react-native';
import type { AvatarState } from '../types';

interface AvatarProps {
  state: AvatarState;
  size?: number;
}

export function Avatar({ state, size = 80 }: AvatarProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation;

    switch (state) {
      case 'idle':
        // Gentle pulse
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.05,
              duration: 2000,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
          ])
        );
        break;

      case 'listening':
        // Expand slightly
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.15,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1.1,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        );
        break;

      case 'thinking':
        // Quick pulse
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 0.95,
              duration: 300,
              useNativeDriver: true,
            }),
          ])
        );
        break;

      case 'speaking':
        // Rhythmic pulse
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.08,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ])
        );
        break;

      case 'alert':
        // Attention-grabbing
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 0.8,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0.3,
              duration: 500,
              useNativeDriver: true,
            }),
          ])
        );
        break;
    }

    animation?.start();
    return () => animation?.stop();
  }, [state, pulseAnim, glowAnim]);

  const stateLabel = {
    idle: '',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
    alert: 'Alert!',
  }[state];

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.avatarContainer,
          {
            width: size,
            height: size,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.glow,
            {
              width: size + 20,
              height: size + 20,
              borderRadius: (size + 20) / 2,
              opacity: glowAnim,
            },
          ]}
        />
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.emoji, { fontSize: size * 0.5 }]}>🔮</Text>
        </View>
      </Animated.View>
      {stateLabel ? (
        <Text style={styles.stateLabel}>{stateLabel}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: '#6366f1',
  },
  avatar: {
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  emoji: {
    textAlign: 'center',
  },
  stateLabel: {
    marginTop: 8,
    fontSize: 14,
    color: '#888',
  },
});
