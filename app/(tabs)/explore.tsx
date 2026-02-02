import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, spacing, borderRadius, typography } from '../../src/constants/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleLogout = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await logout();
    router.replace('/login');
  };

  const handleToggle = async (setter: (value: boolean) => void, value: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter(value);
  };

  return (
    <LinearGradient
      colors={[colors.background, '#0D1526', colors.background]}
      style={styles.container}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: insets.top + spacing.md }}
      >
        <Text style={styles.title}>Settings</Text>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="mail-outline"
              label="Email" 
              value={user?.email || 'Not signed in'} 
            />
            <Divider />
            <SettingsRow 
              icon="shield-checkmark-outline"
              label="Two-Factor Auth" 
              value="Set up" 
              showChevron 
            />
            <Divider />
            <SettingsRow 
              icon="phone-portrait-outline"
              label="Active Sessions" 
              value="1" 
              showChevron 
            />
          </View>
        </View>

        {/* Voice Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>VOICE</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="volume-high-outline"
              label="Voice Output"
              trailing={
                <Switch
                  value={voiceEnabled}
                  onValueChange={(v) => handleToggle(setVoiceEnabled, v)}
                  trackColor={{ false: colors.surfaceElevated, true: colors.primaryMuted }}
                  thumbColor={voiceEnabled ? colors.primary : colors.textTertiary}
                />
              }
            />
            <Divider />
            <SettingsRow 
              icon="mic-outline"
              label="Echo's Voice" 
              value="Nova" 
              showChevron 
            />
            <Divider />
            <SettingsRow 
              icon="speedometer-outline"
              label="Speed" 
              value="Normal" 
              showChevron 
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="notifications-outline"
              label="Push Notifications"
              trailing={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={(v) => handleToggle(setNotificationsEnabled, v)}
                  trackColor={{ false: colors.surfaceElevated, true: colors.primaryMuted }}
                  thumbColor={notificationsEnabled ? colors.primary : colors.textTertiary}
                />
              }
            />
            <Divider />
            <SettingsRow 
              icon="moon-outline"
              label="Focus Mode Behavior" 
              value="Respect" 
              showChevron 
            />
          </View>
        </View>

        {/* Privacy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PRIVACY</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="eye-outline"
              label="What Echo Knows" 
              showChevron 
            />
            <Divider />
            <SettingsRow 
              icon="download-outline"
              label="Export My Data" 
              showChevron 
            />
            <Divider />
            <SettingsRow 
              icon="trash-outline"
              label="Delete All Data" 
              labelColor={colors.error}
              showChevron 
            />
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.version}>Echo App v0.1.0</Text>
        <View style={{ height: insets.bottom + spacing.xl }} />
      </ScrollView>
    </LinearGradient>
  );
}

interface SettingsRowProps {
  icon: string;
  label: string;
  value?: string;
  labelColor?: string;
  showChevron?: boolean;
  trailing?: React.ReactNode;
  onPress?: () => void;
}

function SettingsRow({ 
  icon, 
  label, 
  value, 
  labelColor,
  showChevron, 
  trailing,
  onPress 
}: SettingsRowProps) {
  const content = (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons 
          name={icon as any} 
          size={20} 
          color={labelColor || colors.textSecondary} 
        />
        <Text style={[styles.label, labelColor && { color: labelColor }]}>
          {label}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {trailing || (
          <>
            {value && <Text style={styles.value}>{value}</Text>}
            {showChevron && (
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            )}
          </>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: spacing.md,
  },
  title: {
    fontSize: typography['3xl'],
    fontWeight: typography.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.base,
    color: colors.textPrimary,
  },
  value: {
    fontSize: typography.base,
    color: colors.textTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 20 + spacing.sm, // icon + gap
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: {
    fontSize: typography.base,
    color: colors.error,
    fontWeight: typography.medium,
  },
  version: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: typography.xs,
    marginTop: spacing.lg,
  },
});
