import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  Easing,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { AvatarState } from '../types';

interface AvatarProps {
  state: AvatarState;
  size?: number;
  onPress?: () => void;
  isRecording?: boolean;
  audioLevel?: number;
}

// Jellyfish color palette - bright center to darker edges
const JELLY_COLORS = {
  core: ['#FFFFFF', '#67E8F9', '#22D3EE'],           // White to bright cyan
  inner: ['#22D3EE', '#06B6D4'],                     // Bright cyan
  middle: ['#06B6D4', '#0891B2'],                    // Cyan to darker cyan
  outer: ['#0891B2', '#0E7490'],                     // Darker cyan to teal
  glow: ['#22D3EE', '#06B6D4', '#0891B2'],          // Glow gradient
  recording: ['#F472B6', '#EC4899', '#DB2777'],     // Pink when recording
  thinking: ['#FDE047', '#FACC15', '#EAB308'],      // Yellow when thinking
};

export function Avatar({ 
  state, 
  size = 120, 
  onPress, 
  isRecording = false,
  audioLevel = 0 
}: AvatarProps) {
  // Animated values for each layer's flow
  const layer1Flow = useRef(new Animated.Value(0)).current;
  const layer2Flow = useRef(new Animated.Value(0)).current;
  const layer3Flow = useRef(new Animated.Value(0)).current;
  const layer4Flow = useRef(new Animated.Value(0)).current;
  const layer5Flow = useRef(new Animated.Value(0)).current;
  
  // Scale animations
  const coreScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.4)).current;
  const overallScale = useRef(new Animated.Value(1)).current;

  // Main flowing animation - always running
  useEffect(() => {
    // Each layer flows at a slightly different speed for organic feel
    const createFlowAnimation = (anim: Animated.Value, duration: number, delay: number = 0) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );
    };

    const flow1 = createFlowAnimation(layer1Flow, 3000, 0);
    const flow2 = createFlowAnimation(layer2Flow, 3500, 200);
    const flow3 = createFlowAnimation(layer3Flow, 4000, 400);
    const flow4 = createFlowAnimation(layer4Flow, 4500, 600);
    const flow5 = createFlowAnimation(layer5Flow, 5000, 800);

    flow1.start();
    flow2.start();
    flow3.start();
    flow4.start();
    flow5.start();

    return () => {
      flow1.stop();
      flow2.stop();
      flow3.stop();
      flow4.stop();
      flow5.stop();
    };
  }, []);

  // Core breathing animation
  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(coreScale, {
          toValue: 1.15,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(coreScale, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, [coreScale]);

  // Glow pulse animation
  useEffect(() => {
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: isRecording ? 0.8 : 0.6,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: isRecording ? 0.5 : 0.3,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, [glowOpacity, isRecording]);

  // Recording/state-based intensity
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(overallScale, {
            toValue: 1.08,
            duration: 300,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(overallScale, {
            toValue: 1,
            duration: 300,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        overallScale.setValue(1);
      };
    } else if (state === 'thinking') {
      const think = Animated.loop(
        Animated.sequence([
          Animated.timing(overallScale, {
            toValue: 1.05,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(overallScale, {
            toValue: 0.98,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      think.start();
      return () => {
        think.stop();
        overallScale.setValue(1);
      };
    } else if (state === 'speaking') {
      const speak = Animated.loop(
        Animated.sequence([
          Animated.timing(overallScale, {
            toValue: 1.1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(overallScale, {
            toValue: 1.02,
            duration: 200,
            useNativeDriver: true,
          }),
        ])
      );
      speak.start();
      return () => {
        speak.stop();
        overallScale.setValue(1);
      };
    }
  }, [isRecording, state, overallScale]);

  const handlePress = async () => {
    await Haptics.impactAsync(
      isRecording 
        ? Haptics.ImpactFeedbackStyle.Medium 
        : Haptics.ImpactFeedbackStyle.Heavy
    );
    onPress?.();
  };

  // Interpolate flow values to scale transforms
  const createLayerTransform = (flowAnim: Animated.Value, baseScale: number, variance: number) => {
    return {
      scale: flowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [baseScale - variance, baseScale + variance],
      }),
    };
  };

  // Choose colors based on state
  const getColors = () => {
    if (isRecording) return JELLY_COLORS.recording;
    if (state === 'thinking') return JELLY_COLORS.thinking;
    return JELLY_COLORS.core;
  };

  const stateColors = getColors();

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
            width: size * 2, 
            height: size * 2,
            transform: [{ scale: overallScale }],
          }
        ]}
      >
        {/* Outer glow */}
        <Animated.View
          style={[
            styles.glowLayer,
            {
              width: size * 1.8,
              height: size * 1.8,
              borderRadius: size * 0.9,
              opacity: glowOpacity,
              backgroundColor: isRecording ? '#EC4899' : state === 'thinking' ? '#FACC15' : '#06B6D4',
            },
          ]}
        />

        {/* Layer 5 - Outermost (darkest) */}
        <Animated.View
          style={[
            styles.jellylayer,
            {
              width: size * 1.4,
              height: size * 1.4,
              borderRadius: size * 0.7,
              backgroundColor: isRecording ? '#DB277740' : state === 'thinking' ? '#EAB30840' : '#0E749040',
              transform: [createLayerTransform(layer5Flow, 1, 0.08)],
            },
          ]}
        />

        {/* Layer 4 */}
        <Animated.View
          style={[
            styles.jellylayer,
            {
              width: size * 1.2,
              height: size * 1.2,
              borderRadius: size * 0.6,
              backgroundColor: isRecording ? '#EC489950' : state === 'thinking' ? '#FACC1550' : '#0891B250',
              transform: [createLayerTransform(layer4Flow, 1, 0.07)],
            },
          ]}
        />

        {/* Layer 3 */}
        <Animated.View
          style={[
            styles.jellylayer,
            {
              width: size * 1.0,
              height: size * 1.0,
              borderRadius: size * 0.5,
              backgroundColor: isRecording ? '#F472B660' : state === 'thinking' ? '#FDE04760' : '#06B6D460',
              transform: [createLayerTransform(layer3Flow, 1, 0.06)],
            },
          ]}
        />

        {/* Layer 2 */}
        <Animated.View
          style={[
            styles.jellylayer,
            {
              width: size * 0.8,
              height: size * 0.8,
              borderRadius: size * 0.4,
              backgroundColor: isRecording ? '#F9A8D470' : state === 'thinking' ? '#FEF08A70' : '#22D3EE70',
              transform: [createLayerTransform(layer2Flow, 1, 0.05)],
            },
          ]}
        />

        {/* Layer 1 - Inner */}
        <Animated.View
          style={[
            styles.jellylayer,
            {
              width: size * 0.6,
              height: size * 0.6,
              borderRadius: size * 0.3,
              backgroundColor: isRecording ? '#FBCFE880' : state === 'thinking' ? '#FEF9C380' : '#67E8F980',
              transform: [createLayerTransform(layer1Flow, 1, 0.04)],
            },
          ]}
        />

        {/* Core - Brightest center */}
        <Animated.View
          style={[
            styles.core,
            {
              width: size * 0.35,
              height: size * 0.35,
              borderRadius: size * 0.175,
              transform: [{ scale: coreScale }],
            },
          ]}
        >
          <LinearGradient
            colors={isRecording 
              ? ['#FFFFFF', '#FBCFE8', '#F9A8D4']
              : state === 'thinking'
                ? ['#FFFFFF', '#FEF9C3', '#FDE047']
                : ['#FFFFFF', '#CFFAFE', '#67E8F9']
            }
            style={styles.coreGradient}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </Animated.View>

        {/* Inner shimmer/highlight */}
        <View
          style={[
            styles.shimmer,
            {
              width: size * 0.15,
              height: size * 0.15,
              borderRadius: size * 0.075,
              top: size * 0.85,
              left: size * 0.85,
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
  glowLayer: {
    position: 'absolute',
  },
  jellylayer: {
    position: 'absolute',
    // Soft edges
    shadowColor: '#06B6D4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  core: {
    position: 'absolute',
    overflow: 'hidden',
    // Bright glow
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  coreGradient: {
    flex: 1,
    borderRadius: 999,
  },
  shimmer: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
});
