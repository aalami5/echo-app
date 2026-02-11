/**
 * Network Status Indicator
 * 
 * Shows connection quality as signal bars.
 * Tapping shows latency details.
 */

import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { useNetworkStore } from '../stores/networkStore';
import type { ConnectionQuality } from '../types';

interface NetworkIndicatorProps {
  compact?: boolean;
  onPress?: () => void;
}

const qualityConfig: Record<ConnectionQuality, { 
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bars: number;
  label: string;
}> = {
  excellent: { icon: 'wifi', color: colors.success, bars: 4, label: 'Excellent' },
  good: { icon: 'wifi', color: colors.primary, bars: 3, label: 'Good' },
  poor: { icon: 'wifi', color: colors.warning, bars: 2, label: 'Poor' },
  offline: { icon: 'cloud-offline-outline', color: colors.error, bars: 0, label: 'Offline' },
};

export function NetworkIndicator({ compact = true, onPress }: NetworkIndicatorProps) {
  const { connectionQuality, latencyMs, isConnected } = useNetworkStore();
  
  const config = qualityConfig[connectionQuality];

  if (compact) {
    // Simple icon indicator
    return (
      <TouchableOpacity onPress={onPress} style={styles.compactContainer}>
        <Ionicons name={config.icon} size={14} color={config.color} />
      </TouchableOpacity>
    );
  }

  // Expanded signal bars with latency
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <View style={styles.barsContainer}>
        {[1, 2, 3, 4].map((bar) => (
          <View
            key={bar}
            style={[
              styles.bar,
              { height: 4 + bar * 3 },
              bar <= config.bars ? { backgroundColor: config.color } : styles.barInactive,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.label, { color: config.color }]}>
        {isConnected && latencyMs !== null ? `${latencyMs}ms` : config.label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  compactContainer: {
    padding: spacing.xs,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  barInactive: {
    backgroundColor: colors.border,
  },
  label: {
    fontSize: typography.xs,
    fontWeight: '500',
  },
});
