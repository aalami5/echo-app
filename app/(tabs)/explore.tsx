import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useAuthStore } from '../../src/stores/authStore';
import { useChatStore } from '../../src/stores/chatStore';
import { useSettingsStore, TextScale } from '../../src/stores/settingsStore';
import { useCalendar } from '../../src/hooks/useCalendar';
import { useCalendarStore } from '../../src/stores/calendarStore';
import { usePatientSync } from '../../src/hooks/usePatientSync';
import { useScaledTypography, TEXT_SCALE_LABELS } from '../../src/hooks/useScaledTypography';
import { VOICES, VoiceName } from '../../src/services/elevenlabs';
import { colors, spacing, borderRadius, typography } from '../../src/constants/theme';
import { clearCrashLogs, getCrashLogs } from '../../src/services/crashLog';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { isConnected } = useChatStore();
  const { 
    openaiApiKey, 
    elevenlabsApiKey, 
    gatewayUrl,
    gatewayToken,
    voiceName,
    voiceEnabled,
    autoPlayResponses,
    textScale,
    setOpenAIKey, 
    setElevenLabsKey,
    setGatewayUrl,
    setGatewayToken,
    setVoiceName,
    setVoiceEnabled,
    setAutoPlayResponses,
    setTextScale,
  } = useSettingsStore();
  const scaledTypography = useScaledTypography();
  const { isLoading: calendarSyncing, lastFetched: lastCalendarSync, refresh: refreshCalendar, error: calendarError } = useCalendar();
  const calendarStore = useCalendarStore();
  const { isSyncing: patientSyncing, lastSynced: lastPatientSync, syncNow: syncPatients, error: patientSyncError, patientCount } = usePatientSync();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [crashLogCount, setCrashLogCount] = useState(0);

  const connectionStatus: ConnectionStatus = isConnected ? 'connected' : 'disconnected';

  const refreshCrashLogs = async () => {
    const logs = await getCrashLogs();
    setCrashLogCount(logs.length);
    return logs;
  };

  useEffect(() => {
    refreshCrashLogs();
  }, []);

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
    await refreshCalendar();
    if (calendarError) {
      Alert.alert('Sync Error', calendarError);
    }
  };

  const handleSyncPatients = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await syncPatients();
    if (patientSyncError) {
      Alert.alert('Sync Error', patientSyncError);
    }
  };

  const handleClearCalendarCache = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Clear Calendar Cache',
      'This will remove all cached calendar events. They will be re-synced from Google Calendar.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            calendarStore.setEvents([]);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Cache Cleared', 'Calendar events have been cleared. Pull to refresh on the Today tab to reload.');
          },
        },
      ]
    );
  };

  const handleViewCrashLogs = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const logs = await refreshCrashLogs();
    if (logs.length === 0) {
      Alert.alert('Crash Logs', 'No crash logs found.');
      return;
    }

    const recent = logs.slice(-5).reverse();
    const message = recent
      .map((entry) => `${new Date(entry.timestamp).toLocaleString()}\n${entry.message}`)
      .join('\n\n');

    Alert.alert('Crash Logs (Last 5)', message);
  };

  const handleClearCrashLogs = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Clear Crash Logs', 'This will remove all stored crash logs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearCrashLogs();
          await refreshCrashLogs();
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    ]);
  };

  const formatLastSync = (date: Date | number | null) => {
    if (!date) return 'Never';
    const timestamp = typeof date === 'number' ? date : date.getTime();
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString();
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
            <Divider full />
            <SettingsRow 
              icon="people-outline"
              label="Patient Sync"
              trailing={
                <TouchableOpacity 
                  style={styles.syncButton}
                  onPress={handleSyncPatients}
                  disabled={patientSyncing}
                  activeOpacity={0.7}
                >
                  {patientSyncing ? (
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
              value={formatLastSync(lastPatientSync)} 
            />
            <Divider />
            <SettingsRow 
              icon="document-text-outline"
              label="Patients" 
              value={`${patientCount} stored`}
              valueColor={patientCount > 0 ? colors.success : colors.textTertiary}
            />
          </View>
          <Text style={styles.sectionHint}>
            Patient data syncs automatically every 5 minutes
          </Text>
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

        {/* API Keys Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API KEYS</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="key-outline"
              label="OpenAI (Whisper)"
              value={openaiApiKey ? '••••••••' + openaiApiKey.slice(-4) : 'Not set'}
              valueColor={openaiApiKey ? colors.success : colors.textTertiary}
              showChevron
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Alert.prompt(
                    'OpenAI API Key',
                    'Enter your OpenAI API key for Whisper speech-to-text',
                    (key) => { if (key) setOpenAIKey(key); },
                    'plain-text',
                    openaiApiKey || ''
                  );
                } else {
                  Alert.alert('API Key', 'Please configure API keys in settings file on Android');
                }
              }}
            />
            <Divider />
            <SettingsRow 
              icon="musical-notes-outline"
              label="ElevenLabs (TTS)"
              value={elevenlabsApiKey ? '••••••••' + elevenlabsApiKey.slice(-4) : 'Not set'}
              valueColor={elevenlabsApiKey ? colors.success : colors.textTertiary}
              showChevron
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Alert.prompt(
                    'ElevenLabs API Key',
                    'Enter your ElevenLabs API key for text-to-speech',
                    (key) => { if (key) setElevenLabsKey(key); },
                    'plain-text',
                    elevenlabsApiKey || ''
                  );
                } else {
                  Alert.alert('API Key', 'Please configure API keys in settings file on Android');
                }
              }}
            />
            <Divider />
            <SettingsRow 
              icon="globe-outline"
              label="Gateway URL"
              value={gatewayUrl ? gatewayUrl.replace(/^https?:\/\//, '').slice(0, 25) + '...' : 'Not set'}
              valueColor={gatewayUrl ? colors.success : colors.textTertiary}
              showChevron
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Alert.prompt(
                    'Gateway URL',
                    'Enter the OpenClaw Gateway URL (e.g., https://your-tunnel.trycloudflare.com)',
                    (url) => { if (url) setGatewayUrl(url); },
                    'plain-text',
                    gatewayUrl || ''
                  );
                } else {
                  Alert.alert('Gateway URL', 'Please configure Gateway URL in settings file on Android');
                }
              }}
            />
            <Divider />
            <SettingsRow 
              icon="lock-closed-outline"
              label="Gateway Token"
              value={gatewayToken ? '••••••••' + gatewayToken.slice(-4) : 'Not set'}
              valueColor={gatewayToken ? colors.success : colors.textTertiary}
              showChevron
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Alert.prompt(
                    'Gateway Token',
                    'Enter your Gateway authentication token',
                    (token) => { if (token) setGatewayToken(token); },
                    'plain-text',
                    gatewayToken || ''
                  );
                } else {
                  Alert.alert('Gateway Token', 'Please configure Gateway token in settings file on Android');
                }
              }}
            />
          </View>
          <Text style={styles.sectionHint}>
            API keys are stored securely on your device
          </Text>
        </View>

        {/* Voice Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>VOICE</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="volume-high-outline"
              label="Voice Responses"
              trailing={
                <Switch
                  value={voiceEnabled}
                  onValueChange={(v) => setVoiceEnabled(v)}
                  trackColor={{ false: colors.surfaceElevated, true: colors.primaryMuted }}
                  thumbColor={voiceEnabled ? colors.primary : colors.textTertiary}
                />
              }
            />
            <Divider />
            <SettingsRow 
              icon="play-outline"
              label="Auto-play Responses"
              trailing={
                <Switch
                  value={autoPlayResponses}
                  onValueChange={(v) => setAutoPlayResponses(v)}
                  trackColor={{ false: colors.surfaceElevated, true: colors.primaryMuted }}
                  thumbColor={autoPlayResponses ? colors.primary : colors.textTertiary}
                />
              }
            />
            <Divider />
            <SettingsRow 
              icon="mic-outline"
              label="Echo's Voice" 
              value={voiceName.charAt(0).toUpperCase() + voiceName.slice(1)}
              showChevron 
            />
          </View>
        </View>

        {/* Accessibility Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCESSIBILITY</Text>
          <View style={styles.card}>
            <View style={styles.textSizeRow}>
              <View style={styles.textSizeHeader}>
                <Ionicons name="text-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.label}>Text Size</Text>
              </View>
              <View style={styles.textSizeButtons}>
                {(['normal', 'large', 'xlarge'] as TextScale[]).map((scale) => (
                  <TouchableOpacity
                    key={scale}
                    style={[
                      styles.textSizeButton,
                      textScale === scale && styles.textSizeButtonActive,
                    ]}
                    onPress={async () => {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setTextScale(scale);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.textSizeButtonText,
                        textScale === scale && styles.textSizeButtonTextActive,
                        { fontSize: scale === 'normal' ? 14 : scale === 'large' ? 16 : 18 },
                      ]}
                    >
                      {scale === 'normal' ? 'A' : scale === 'large' ? 'A' : 'A'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Divider full />
            <SettingsRow 
              icon="information-circle-outline"
              label="Current Size"
              value={TEXT_SCALE_LABELS[textScale]}
              valueColor={colors.primary}
            />
          </View>
          <Text style={styles.sectionHint}>
            Adjusts text size throughout the app for better readability
          </Text>
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
            <Divider />
            <SettingsRow 
              icon="trash-outline"
              label="Clear Calendar Cache"
              value={`${calendarStore.events.length} events`}
              valueColor={colors.textTertiary}
              showChevron
              onPress={handleClearCalendarCache}
            />
          </View>
          <Text style={styles.sectionHint}>
            Clearing cache removes locally stored events. Pull to refresh to reload from Google.
          </Text>
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

        {/* Crash Logs Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CRASH LOGS</Text>
          <View style={styles.card}>
            <SettingsRow 
              icon="bug-outline"
              label="Stored Logs"
              value={`${crashLogCount} stored`}
              valueColor={crashLogCount > 0 ? colors.warning : colors.textTertiary}
            />
            <Divider />
            <SettingsRow 
              icon="options-outline"
              label="Actions"
              trailing={
                <View style={styles.crashActions}>
                  <TouchableOpacity
                    style={styles.crashButton}
                    onPress={handleViewCrashLogs}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.crashButtonText}>View Logs</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.crashButton, styles.crashButtonDestructive]}
                    onPress={handleClearCrashLogs}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.crashButtonText, styles.crashButtonTextDestructive]}>
                      Clear Logs
                    </Text>
                  </TouchableOpacity>
                </View>
              }
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
        <Text style={styles.version}>
          Echo App v{Constants.expoConfig?.version || '1.0.0'} (Build {Constants.expoConfig?.ios?.buildNumber || 'dev'})
        </Text>
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
  sectionHint: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
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
  crashActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  crashButton: {
    backgroundColor: colors.primarySubtle,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  crashButtonText: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  crashButtonDestructive: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.error,
  },
  crashButtonTextDestructive: {
    color: colors.error,
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
  textSizeRow: {
    padding: spacing.md,
  },
  textSizeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  textSizeButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  textSizeButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textSizeButtonActive: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primary,
  },
  textSizeButtonText: {
    fontWeight: '600',
    color: colors.textSecondary,
  },
  textSizeButtonTextActive: {
    color: colors.primary,
  },
});
