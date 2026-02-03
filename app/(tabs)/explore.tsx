import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../../src/stores/authStore';
import { useWebSocketStore } from '../../src/stores/websocketStore';
import { colors, spacing, borderRadius, typography } from '../../src/constants/theme';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { isConnected, lastMessageTime } = useWebSocketStore();
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [lastCalendarSync, setLastCalendarSync] = useState<Date | null>(null);

  const connectionStatus: ConnectionStatus = isConnected ? 'connected' : 'disconnected';

  const handleLogout = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await logout();
    router.replace('/login');
  };

  const handleToggle = async (setter: (value: boolean) => void, value: boolean) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setter(value);
  };

  const handleSyncCalendar = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCalendarSyncing(true);
    // Simulate sync - in production this would call the Gateway
    setTimeout(() => {
      setCalendarSyncing(false);
      setLastCalendarSync(new Date());
    }, 2000);
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected': return colors.success;
      case 'connecting': return colors.warning;
      case 'disconnected': return colors.textTertiary;
      case 'error': return colors.error;
    }
  };

  const getStatusText = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'disconnected': return 'Offline';
      case 'error': return 'Connection Error';
    }
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

        {/* Connection Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONNECTION</Text>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={styles.statusLeft}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(connectionStatus) }]} />
                <View>
                  <Text style={styles.statusLabel}>Echo Gateway</Text>
                  <Text style={styles.statusValue}>{getStatusText(connectionStatus)}</Text>
                </View>
              </View>
              {connectionStatus === 'disconnected' && (
                <TouchableOpacity style={styles.retryButton} activeOpacity={0.7}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
            <Divider full />
            <SettingsRow 
              icon="sync-outline"
              label="Calendar Sync"
              trailing={
                <TouchableOpacity 
                  style={styles.syncButton}
                  onPress={handleSyncCalendar}
                  disabled={calendarSyncing}
                  activeOpacity={0.7}
                >
                  {calendarSyncing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={16} color={colors.primary} />
                      <Text style={styles.syncButtonText}>Sync</Text>
                    </>
                  )}
                </TouchableOpacity>
              }
            />
            <Divider />
            <SettingsRow 
              icon="time-outline"
              label="Last Synced" 
              value={formatLastSync(lastCalendarSync)} 
            />
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="person-outline"
              label="Name" 
              value={user?.name || 'Oliver Aalami'} 
            />
            <Divider />
            <SettingsRow 
              icon="mail-outline"
              label="Email" 
              value={user?.email || 'aalami@gmail.com'} 
            />
            <Divider />
            <SettingsRow 
              icon="phone-portrait-outline"
              label="Device" 
              value="iPhone" 
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
              icon="alarm-outline"
              label="Meeting Reminders" 
              value="15 min before" 
              showChevron 
            />
            <Divider />
            <SettingsRow 
              icon="moon-outline"
              label="Quiet Hours" 
              value="11pm - 8am" 
              showChevron 
            />
          </View>
        </View>

        {/* Calendar Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CALENDARS</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="logo-google"
              label="Google Calendar" 
              value="Connected"
              valueColor={colors.success}
            />
            <Divider />
            <SettingsRow 
              icon="calendar-outline"
              label="Show All-Day Events" 
              trailing={
                <Switch
                  value={false}
                  onValueChange={() => {}}
                  trackColor={{ false: colors.surfaceElevated, true: colors.primaryMuted }}
                  thumbColor={colors.textTertiary}
                />
              }
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
        <Text style={styles.versionSub}>Gateway: Mac mini • Channel: WhatsApp</Text>
        <View style={{ height: insets.bottom + spacing.xl + 60 }} />
      </ScrollView>
    </LinearGradient>
  );
}

interface SettingsRowProps {
  icon: string;
  label: string;
  value?: string;
  labelColor?: string;
  valueColor?: string;
  showChevron?: boolean;
  trailing?: React.ReactNode;
  onPress?: () => void;
}

function SettingsRow({ 
  icon, 
  label, 
  value, 
  labelColor,
  valueColor,
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
            {value && (
              <Text style={[styles.value, valueColor && { color: valueColor }]}>
                {value}
              </Text>
            )}
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

function Divider({ full = false }: { full?: boolean }) {
  return (
    <View 
      style={[
        styles.divider, 
        full && { marginLeft: 0 }
      ]} 
    />
  );
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
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.xs,
    fontWeight: '600',
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusLabel: {
    fontSize: typography.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  statusValue: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  retryButton: {
    backgroundColor: colors.primarySubtle,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primarySubtle,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
  },
  syncButtonText: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.primary,
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
    fontWeight: '500',
  },
  version: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: typography.xs,
    marginTop: spacing.lg,
  },
  versionSub: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: typography.xs,
    marginTop: spacing.xs,
    opacity: 0.7,
  },
});
