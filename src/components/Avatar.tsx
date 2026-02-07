import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Circle, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { AvatarState } from '../types';

interface AvatarProps {
  state: AvatarState;
  size?: number;
  onPress?: () => void;
  isRecording?: boolean;
  audioLevel?: number;
}

// Attempt simpler approach with animated circular layers that have wavy borders
const AnimatedView = Animated.View;

export function Avatar({ 
  state, 
  size = 120, 
  onPress, 
  isRecording = false,
  audioLevel = 0 
}: AvatarProps) {
  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.5)).current;
  const layer1Anim = useRef(new Animated.Value(1)).current;
  const layer2Anim = useRef(new Animated.Value(1)).current;
  const layer3Anim = useRef(new Animated.Value(1)).current;
  const layer4Anim = useRef(new Animated.Value(1)).current;
  const accentRotate = useRef(new Animated.Value(0)).current;

  // Determine animation intensity based on state
  const getIntensity = () => {
    if (state === 'speaking') return { speed: 0.5, scale: 0.15 }; // Most dynamic
    if (isRecording) return { speed: 0.7, scale: 0.1 }; // Moderate
    if (state === 'thinking') return { speed: 1.2, scale: 0.03 }; // Subtle, dense
    return { speed: 1, scale: 0.05 }; // Idle - gentle
  };

  const intensity = getIntensity();

  // Main pulse animation
  useEffect(() => {
    const createLayerPulse = (anim: Animated.Value, duration: number, delay: number, scale: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1 + scale,
            duration: duration * intensity.speed,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 1 - scale * 0.5,
            duration: duration * intensity.speed,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const pulse1 = createLayerPulse(layer1Anim, 2000, 0, intensity.scale);
    const pulse2 = createLayerPulse(layer2Anim, 2200, 150, intensity.scale * 0.8);
    const pulse3 = createLayerPulse(layer3Anim, 2400, 300, intensity.scale * 0.6);
    const pulse4 = createLayerPulse(layer4Anim, 2600, 450, intensity.scale * 0.4);

    pulse1.start();
    pulse2.start();
    pulse3.start();
    pulse4.start();

    return () => {
      pulse1.stop();
      pulse2.stop();
      pulse3.stop();
      pulse4.stop();
    };
  }, [intensity.speed, intensity.scale]);

  // Glow animation
  useEffect(() => {
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: state === 'speaking' ? 0.9 : isRecording ? 0.75 : 0.6,
          duration: 1500 * intensity.speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: state === 'speaking' ? 0.5 : isRecording ? 0.4 : 0.3,
          duration: 1500 * intensity.speed,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, [state, isRecording, intensity.speed]);

  // Rotation for accent elements
  useEffect(() => {
    const rotate = Animated.loop(
      Animated.timing(accentRotate, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotate.start();
    return () => rotate.stop();
  }, []);

  // Core pulse for speaking
  useEffect(() => {
    if (state === 'speaking') {
      const speak = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
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
    } else {
      pulseAnim.setValue(1);
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

  // Color schemes
  const isThinking = state === 'thinking';
  const colors = isThinking ? {
    outer: '#4A3F00',
    mid1: '#6B5A00',
    mid2: '#9A8200',
    inner: '#CAAB00',
    core: '#FFE066',
    glow: '#FACC15',
    accent: '#FDE047',
  } : {
    outer: '#0A2E3D',
    mid1: '#0C4A5E',
    mid2: '#0E6377',
    inner: '#0EA5B5',
    core: '#67E8F9',
    glow: '#22D3EE',
    accent: '#06B6D4',
  };

  const spin = accentRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const reverseSpin = accentRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      disabled={!onPress}
    >
      <View style={[styles.container, { width: size * 2, height: size * 2 }]}>
        
        {/* Outer glow */}
        <Animated.View
          style={[
            styles.glow,
            {
              width: size * 1.6,
              height: size * 1.6,
              borderRadius: size * 0.8,
              backgroundColor: colors.glow,
              opacity: glowAnim,
            },
          ]}
        />

        {/* Rotating accent elements */}
        <Animated.View
          style={[
            styles.accentContainer,
            {
              width: size * 1.8,
              height: size * 1.8,
              transform: [{ rotate: spin }],
            },
          ]}
        >
          {/* Accent dots */}
          <View style={[styles.accentDot, { backgroundColor: colors.accent, top: 0, left: '45%' }]} />
          <View style={[styles.accentDot, { backgroundColor: colors.accent, bottom: 0, left: '45%' }]} />
          <View style={[styles.accentDot, { backgroundColor: colors.accent, left: 0, top: '45%' }]} />
          <View style={[styles.accentDot, { backgroundColor: colors.accent, right: 0, top: '45%' }]} />
          
          {/* Accent arcs */}
          <View style={[styles.accentArc, { backgroundColor: colors.accent, top: '10%', left: '10%', transform: [{ rotate: '-45deg' }] }]} />
          <View style={[styles.accentArc, { backgroundColor: colors.accent, top: '10%', right: '10%', transform: [{ rotate: '45deg' }] }]} />
          <View style={[styles.accentArc, { backgroundColor: colors.accent, bottom: '10%', left: '10%', transform: [{ rotate: '45deg' }] }]} />
          <View style={[styles.accentArc, { backgroundColor: colors.accent, bottom: '10%', right: '10%', transform: [{ rotate: '-45deg' }] }]} />
        </Animated.View>

        {/* Counter-rotating accents */}
        <Animated.View
          style={[
            styles.accentContainer,
            {
              width: size * 1.5,
              height: size * 1.5,
              transform: [{ rotate: reverseSpin }],
            },
          ]}
        >
          <View style={[styles.accentDotSmall, { backgroundColor: colors.accent, top: '5%', left: '30%' }]} />
          <View style={[styles.accentDotSmall, { backgroundColor: colors.accent, bottom: '5%', right: '30%' }]} />
          <View style={[styles.accentDotSmall, { backgroundColor: colors.accent, top: '30%', right: '5%' }]} />
          <View style={[styles.accentDotSmall, { backgroundColor: colors.accent, bottom: '30%', left: '5%' }]} />
        </Animated.View>

        {/* Layer 4 - Outermost */}
        <Animated.View
          style={[
            styles.blobLayer,
            {
              width: size * 1.3,
              height: size * 1.3,
              borderRadius: size * 0.35,
              backgroundColor: colors.outer,
              transform: [{ scale: layer4Anim }, { rotate: '45deg' }],
            },
          ]}
        />

        {/* Layer 3 */}
        <Animated.View
          style={[
            styles.blobLayer,
            {
              width: size * 1.1,
              height: size * 1.1,
              borderRadius: size * 0.3,
              backgroundColor: colors.mid1,
              transform: [{ scale: layer3Anim }, { rotate: '45deg' }],
              borderWidth: 2,
              borderColor: colors.accent + '40',
            },
          ]}
        />

        {/* Layer 2 */}
        <Animated.View
          style={[
            styles.blobLayer,
            {
              width: size * 0.85,
              height: size * 0.85,
              borderRadius: size * 0.22,
              backgroundColor: colors.mid2,
              transform: [{ scale: layer2Anim }, { rotate: '45deg' }],
              borderWidth: 1.5,
              borderColor: colors.accent + '60',
            },
          ]}
        />

        {/* Layer 1 - Inner */}
        <Animated.View
          style={[
            styles.blobLayer,
            {
              width: size * 0.6,
              height: size * 0.6,
              borderRadius: size * 0.15,
              backgroundColor: colors.inner,
              transform: [{ scale: layer1Anim }, { rotate: '45deg' }],
            },
          ]}
        />

        {/* Core - Brightest */}
        <Animated.View
          style={[
            styles.core,
            {
              width: size * 0.35,
              height: size * 0.35,
              borderRadius: size * 0.08,
              backgroundColor: colors.core,
              transform: [{ scale: pulseAnim }, { rotate: '45deg' }],
              shadowColor: colors.core,
              shadowOpacity: 0.9,
              shadowRadius: 20,
            },
          ]}
        />

        {/* Center glow point */}
        <Animated.View
          style={[
            styles.centerGlow,
            {
              width: size * 0.15,
              height: size * 0.15,
              borderRadius: size * 0.075,
              backgroundColor: '#FFFFFF',
              opacity: glowAnim,
              shadowColor: '#FFFFFF',
              shadowOpacity: 1,
              shadowRadius: 15,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
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
  accentContainer: {
    position: 'absolute',
  },
  accentDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  accentDotSmall: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.7,
  },
  accentArc: {
    position: 'absolute',
    width: 25,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  blobLayer: {
    position: 'absolute',
  },
  core: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
  },
  centerGlow: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
  },
});
