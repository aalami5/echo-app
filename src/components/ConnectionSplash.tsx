/**
 * Connection Splash Screen
 * 
 * Beautiful animated splash with breathing crystal ball avatar.
 * Shown while establishing gateway connection.
 */

import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Animated,
  Easing,
  Dimensions,
  Text,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '../constants/theme';
import { useConnectionStore, ConnectionState } from '../stores/connectionStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ConnectionSplashProps {
  onReady?: () => void;
  onRetry?: () => void;
}

export function ConnectionSplash({ onReady, onRetry }: ConnectionSplashProps) {
  const insets = useSafeAreaInsets();
  const { state, error, markSplashShown, canDismissSplash } = useConnectionStore();
  
  // Core orb animations
  const coreScale = useRef(new Animated.Value(0.8)).current;
  const coreOpacity = useRef(new Animated.Value(0)).current;
  const coreGlow = useRef(new Animated.Value(0)).current;
  
  // Ring animations - staggered breathing
  const ring1Scale = useRef(new Animated.Value(0.5)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0.4)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;
  const ring3Scale = useRef(new Animated.Value(0.3)).current;
  const ring3Opacity = useRef(new Animated.Value(0)).current;
  
  // Ambient particle animations
  const particle1 = useRef(new Animated.Value(0)).current;
  const particle2 = useRef(new Animated.Value(0)).current;
  const particle3 = useRef(new Animated.Value(0)).current;
  
  // Status text
  const statusOpacity = useRef(new Animated.Value(0)).current;
  
  // Fade out animation
  const fadeOut = useRef(new Animated.Value(1)).current;
  
  // Track if ready to dismiss
  const readyToDismiss = useRef(false);
  
  // Mark splash shown on mount
  useEffect(() => {
    markSplashShown();
  }, []);
  
  // Entrance animation
  useEffect(() => {
    // Fade in core
    Animated.sequence([
      Animated.timing(coreOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      // Expand core
      Animated.timing(coreScale, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start();
    
    // Fade in rings with stagger
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(ring1Opacity, { toValue: 0.7, duration: 500, useNativeDriver: true }),
        Animated.timing(ring1Scale, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ring2Opacity, { toValue: 0.5, duration: 500, useNativeDriver: true }),
        Animated.timing(ring2Scale, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ring3Opacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(ring3Scale, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
    ]).start();
    
    // Show status text
    Animated.timing(statusOpacity, {
      toValue: 1,
      duration: 800,
      delay: 400,
      useNativeDriver: true,
    }).start();
  }, []);
  
  // Breathing animation loop
  useEffect(() => {
    // Core breathing
    const coreBreathing = Animated.loop(
      Animated.sequence([
        Animated.timing(coreScale, {
          toValue: 1.08,
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
    
    // Core glow pulse
    const glowPulse = Animated.loop(
      Animated.sequence([
        Animated.timing(coreGlow, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(coreGlow, {
          toValue: 0.5,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    
    // Ring breathing - staggered waves
    const ring1Breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(ring1Scale, {
          toValue: 1.06,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ring1Scale, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    
    const ring2Breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(ring2Scale, {
          toValue: 1.08,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ring2Scale, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    
    const ring3Breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(ring3Scale, {
          toValue: 1.1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(ring3Scale, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    
    // Ambient particles
    const particleAnimation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(particle1, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(particle1, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(particle2, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(particle2, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(particle3, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(particle3, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    );
    
    // Start all animations after entrance
    setTimeout(() => {
      coreBreathing.start();
      glowPulse.start();
      ring1Breathing.start();
      ring2Breathing.start();
      ring3Breathing.start();
      particleAnimation.start();
    }, 800);
    
    return () => {
      coreBreathing.stop();
      glowPulse.stop();
      ring1Breathing.stop();
      ring2Breathing.stop();
      ring3Breathing.stop();
      particleAnimation.stop();
    };
  }, []);
  
  // Handle transition when connected
  useEffect(() => {
    const checkAndDismiss = () => {
      if (canDismissSplash() && !readyToDismiss.current) {
        readyToDismiss.current = true;
        
        // Fade out animation
        Animated.timing(fadeOut, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start(() => {
          onReady?.();
        });
      }
    };
    
    // Check immediately
    checkAndDismiss();
    
    // Also check periodically (for minimum time)
    const interval = setInterval(checkAndDismiss, 100);
    return () => clearInterval(interval);
  }, [state, canDismissSplash, onReady]);
  
  // Status text based on state
  const getStatusText = (): string => {
    switch (state) {
      case 'initializing':
        return 'Waking up...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'Ready';
      case 'failed':
        return error || 'Connection failed';
      default:
        return '';
    }
  };
  
  // Sizes
  const orbSize = 140;
  const coreSize = orbSize * 0.35;
  const ring1Size = orbSize * 0.55;
  const ring2Size = orbSize * 0.75;
  const ring3Size = orbSize * 0.95;
  
  // Ring widths
  const ring1Width = 3.5;
  const ring2Width = 2.5;
  const ring3Width = 1.5;
  
  // Color based on state
  const orbColor = state === 'failed' ? colors.error : colors.primaryMuted;
  
  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <LinearGradient
        colors={['#0B1120', '#0D1526', '#0B1120']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Ambient particles */}
      <Animated.View
        style={[
          styles.particle,
          {
            top: '25%',
            left: '20%',
            opacity: particle1.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.2, 0.6, 0.2],
            }),
            transform: [{
              translateY: particle1.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -30],
              }),
            }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.particle,
          {
            top: '35%',
            right: '25%',
            opacity: particle2.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.15, 0.5, 0.15],
            }),
            transform: [{
              translateY: particle2.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -40],
              }),
            }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.particle,
          styles.particleLarge,
          {
            top: '55%',
            left: '30%',
            opacity: particle3.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.1, 0.4, 0.1],
            }),
            transform: [{
              translateY: particle3.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -20],
              }),
            }],
          },
        ]}
      />
      
      {/* Main orb container */}
      <View style={styles.orbContainer}>
        {/* Ring 3 (outermost) */}
        <Animated.View
          style={[
            styles.ring,
            {
              width: ring3Size,
              height: ring3Size,
              borderRadius: ring3Size / 2,
              borderWidth: ring3Width,
              borderColor: orbColor,
              opacity: ring3Opacity,
              transform: [{ scale: ring3Scale }],
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
              borderWidth: ring2Width,
              borderColor: orbColor,
              opacity: ring2Opacity,
              transform: [{ scale: ring2Scale }],
            },
          ]}
        />
        
        {/* Ring 1 (innermost) */}
        <Animated.View
          style={[
            styles.ring,
            {
              width: ring1Size,
              height: ring1Size,
              borderRadius: ring1Size / 2,
              borderWidth: ring1Width,
              borderColor: orbColor,
              opacity: ring1Opacity,
              transform: [{ scale: ring1Scale }],
            },
          ]}
        />
        
        {/* Glow layer */}
        <Animated.View
          style={[
            styles.glow,
            {
              width: coreSize * 2,
              height: coreSize * 2,
              borderRadius: coreSize,
              backgroundColor: orbColor,
              opacity: coreGlow.interpolate({
                inputRange: [0, 1],
                outputRange: [0.2, 0.5],
              }),
              transform: [{ scale: coreScale }],
            },
          ]}
        />
        
        {/* Core */}
        <Animated.View
          style={[
            styles.core,
            {
              width: coreSize,
              height: coreSize,
              borderRadius: coreSize / 2,
              backgroundColor: orbColor,
              opacity: coreOpacity,
              transform: [{ scale: coreScale }],
              shadowColor: orbColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.9,
              shadowRadius: 20,
            },
          ]}
        />
      </View>
      
      {/* Status text */}
      <Animated.View style={[styles.statusContainer, { opacity: statusOpacity }]}>
        <Text style={[
          styles.statusText,
          state === 'failed' && styles.statusTextError,
        ]}>
          {getStatusText()}
        </Text>
        
        {/* Retry button when failed */}
        {state === 'failed' && onRetry && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>Tap to Retry</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
      
      {/* Echo branding */}
      <View style={[styles.branding, { bottom: insets.bottom + 40 }]}>
        <Text style={styles.brandingText}>Echo</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  orbContainer: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  glow: {
    position: 'absolute',
  },
  core: {
    position: 'absolute',
  },
  particle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primaryMuted,
  },
  particleLarge: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  statusText: {
    fontSize: typography.base,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statusTextError: {
    color: colors.error,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  retryButtonText: {
    fontSize: typography.sm,
    color: colors.primaryMuted,
    fontWeight: '600',
  },
  branding: {
    position: 'absolute',
    alignItems: 'center',
  },
  brandingText: {
    fontSize: typography.lg,
    color: colors.textTertiary,
    fontWeight: '600',
    letterSpacing: 2,
  },
});
