import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/theme';
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
  // Animation values
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const coreGlow = useRef(new Animated.Value(0.6)).current;
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.5)).current;
  const ring2Opacity = useRef(new Animated.Value(0.4)).current;
  const ring3Opacity = useRef(new Animated.Value(0.3)).current;

  // Idle breathing animation
  useEffect(() => {
    if (state === 'idle' && !isRecording) {
      const breathe = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, {
            toValue: 1.05,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breatheAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
      breathe.start();
      return () => breathe.stop();
    }
  }, [state, isRecording]);

  // Core glow pulse
  useEffect(() => {
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(coreGlow, {
          toValue: isRecording ? 1 : state === 'speaking' ? 0.9 : 0.8,
          duration: isRecording ? 300 : 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(coreGlow, {
          toValue: isRecording ? 0.6 : state === 'speaking' ? 0.5 : 0.5,
          duration: isRecording ? 300 : 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, [state, isRecording]);

  // Pulsing rings animation - the "echo" effect
  useEffect(() => {
    const duration = isRecording ? 800 : state === 'speaking' ? 600 : state === 'thinking' ? 1200 : 2000;
    
    const createRingPulse = (
      scaleAnim: Animated.Value, 
      opacityAnim: Animated.Value, 
      maxScale: number, 
      delay: number,
      baseOpacity: number
    ) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: maxScale,
              duration: duration,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: duration,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: baseOpacity,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
    };

    const maxScale = isRecording ? 1.8 : state === 'speaking' ? 2.0 : 1.5;
    
    const pulse1 = createRingPulse(ring1, ring1Opacity, maxScale, 0, 0.5);
    const pulse2 = createRingPulse(ring2, ring2Opacity, maxScale, duration / 3, 0.4);
    const pulse3 = createRingPulse(ring3, ring3Opacity, maxScale, (duration / 3) * 2, 0.3);

    pulse1.start();
    pulse2.start();
    pulse3.start();

    return () => {
      pulse1.stop();
      pulse2.stop();
      pulse3.stop();
      ring1.setValue(1);
      ring2.setValue(1);
      ring3.setValue(1);
      ring1Opacity.setValue(0.5);
      ring2Opacity.setValue(0.4);
      ring3Opacity.setValue(0.3);
    };
  }, [state, isRecording]);

  const handlePress = async () => {
    await Haptics.impactAsync(
      isRecording 
        ? Haptics.ImpactFeedbackStyle.Medium 
        : Haptics.ImpactFeedbackStyle.Heavy
    );
    onPress?.();
  };

  // Colors based on state
  const isThinking = state === 'thinking';
  const coreColor = isThinking ? '#FACC15' : colors.primary;
  const ringColor = isThinking ? '#FDE047' : colors.primary;
  const glowColor = isThinking ? '#FEF08A' : colors.primaryGlow;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      disabled={!onPress}
    >
      <Animated.View 
        style={[
          styles.container, 
          { 
            width: size * 2.2, 
            height: size * 2.2,
            transform: [{ scale: breatheAnim }],
          }
        ]}
      >
        {/* Pulsing ring 3 - outermost */}
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: ringColor,
              opacity: ring3Opacity,
              transform: [{ scale: ring3 }],
            },
          ]}
        />

        {/* Pulsing ring 2 */}
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: ringColor,
              opacity: ring2Opacity,
              transform: [{ scale: ring2 }],
            },
          ]}
        />

        {/* Pulsing ring 1 - innermost ring */}
        <Animated.View
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor: ringColor,
              opacity: ring1Opacity,
              transform: [{ scale: ring1 }],
            },
          ]}
        />

        {/* Outer glow */}
        <Animated.View
          style={[
            styles.glow,
            {
              width: size * 0.9,
              height: size * 0.9,
              borderRadius: size * 0.45,
              backgroundColor: glowColor,
              opacity: coreGlow,
            },
          ]}
        />

        {/* Solid core */}
        <View
          style={[
            styles.core,
            {
              width: size * 0.6,
              height: size * 0.6,
              borderRadius: size * 0.3,
              backgroundColor: coreColor,
              shadowColor: coreColor,
            },
          ]}
        />

        {/* Bright center */}
        <LinearGradient
          colors={isThinking 
            ? ['#FFFFFF', '#FEF9C3', '#FACC15']
            : ['#FFFFFF', '#CFFAFE', colors.primary]
          }
          style={[
            styles.center,
            {
              width: size * 0.35,
              height: size * 0.35,
              borderRadius: size * 0.175,
            },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  glow: {
    position: 'absolute',
  },
  core: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  center: {
    position: 'absolute',
  },
});
