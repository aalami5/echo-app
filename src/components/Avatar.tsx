import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AvatarState } from '../types';
import { colors, shadows } from '../constants/theme';

interface AvatarProps {
  state: AvatarState;
  size?: number;
}

export function Avatar({ state, size = 120 }: AvatarProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const coreAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Reset animations
    pulseAnim.setValue(1);
    glowAnim.setValue(0.3);
    
    let animations: Animated.CompositeAnimation[] = [];

    switch (state) {
      case 'idle':
        // Gentle breathing pulse
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.03,
                duration: 3000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 3000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ])
          )
        );
        // Subtle glow pulse
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(glowAnim, {
                toValue: 0.5,
                duration: 3000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(glowAnim, {
                toValue: 0.3,
                duration: 3000,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ])
          )
        );
        break;

      case 'listening':
        // Expanded, ready state with brighter glow
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.08,
                duration: 800,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1.04,
                duration: 800,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ])
          )
        );
        animations.push(
          Animated.timing(glowAnim, {
            toValue: 0.8,
            duration: 300,
            useNativeDriver: true,
          })
        );
        break;

      case 'thinking':
        // Rotating, processing feel
        animations.push(
          Animated.loop(
            Animated.timing(rotateAnim, {
              toValue: 1,
              duration: 4000,
              easing: Easing.linear,
              useNativeDriver: true,
            })
          )
        );
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(coreAnim, {
                toValue: 0.6,
                duration: 600,
                useNativeDriver: true,
              }),
              Animated.timing(coreAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
              }),
            ])
          )
        );
        break;

      case 'speaking':
        // Rhythmic pulse synced to speech
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.06,
                duration: 150,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1.02,
                duration: 150,
                useNativeDriver: true,
              }),
            ])
          )
        );
        animations.push(
          Animated.timing(glowAnim, {
            toValue: 0.7,
            duration: 200,
            useNativeDriver: true,
          })
        );
        break;

      case 'alert':
        // Attention pulse
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulseAnim, {
                toValue: 1.1,
                duration: 400,
                useNativeDriver: true,
              }),
              Animated.timing(pulseAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }),
            ])
          )
        );
        animations.push(
          Animated.loop(
            Animated.sequence([
              Animated.timing(glowAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }),
              Animated.timing(glowAnim, {
                toValue: 0.4,
                duration: 400,
                useNativeDriver: true,
              }),
            ])
          )
        );
        break;
    }

    animations.forEach(a => a.start());
    
    return () => {
      animations.forEach(a => a.stop());
      rotateAnim.setValue(0);
    };
  }, [state]);

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const stateColor = {
    idle: colors.avatarIdle,
    listening: colors.avatarListening,
    thinking: colors.avatarThinking,
    speaking: colors.avatarSpeaking,
    alert: colors.avatarAlert,
  }[state];

  return (
    <View style={[styles.container, { width: size * 1.5, height: size * 1.5 }]}>
      {/* Outer glow */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 1.4,
            height: size * 1.4,
            borderRadius: size * 0.7,
            backgroundColor: stateColor,
            opacity: glowAnim,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      
      {/* Main avatar body */}
      <Animated.View
        style={[
          styles.avatarOuter,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [
              { scale: pulseAnim },
              { rotate: rotation },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['#1E2D45', '#162032', '#0B1120']}
          style={[styles.gradient, { borderRadius: size / 2 }]}
        >
          {/* Inner rings */}
          <View style={[styles.ring, styles.ring1, { borderColor: stateColor }]} />
          <View style={[styles.ring, styles.ring2, { borderColor: stateColor }]} />
          
          {/* Core */}
          <Animated.View
            style={[
              styles.core,
              {
                backgroundColor: stateColor,
                opacity: coreAnim,
                ...shadows.glow,
                shadowColor: stateColor,
              },
            ]}
          />
        </LinearGradient>
      </Animated.View>
    </View>
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
  avatarOuter: {
    overflow: 'hidden',
    ...shadows.lg,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 999,
    opacity: 0.4,
  },
  ring1: {
    width: '75%',
    height: '75%',
  },
  ring2: {
    width: '55%',
    height: '55%',
  },
  core: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
