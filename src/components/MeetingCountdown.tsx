import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

interface Meeting {
  id: string;
  title: string;
  startTime: Date;
  location?: string;
}

interface MeetingCountdownProps {
  meetings: Meeting[];
}

interface CountdownValues {
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
  isImminent: boolean; // < 15 minutes
}

function getCountdown(targetTime: Date): CountdownValues {
  const now = new Date();
  const diff = targetTime.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isPast: true, isImminent: false };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  const isImminent = diff < 15 * 60 * 1000; // Less than 15 minutes
  
  return { hours, minutes, seconds, isPast: false, isImminent };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function MeetingItem({ meeting }: { meeting: Meeting }) {
  const [countdown, setCountdown] = useState<CountdownValues>(getCountdown(meeting.startTime));
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getCountdown(meeting.startTime));
    }, 1000);
    
    return () => clearInterval(interval);
  }, [meeting.startTime]);
  
  // Pulse animation for imminent meetings
  useEffect(() => {
    if (countdown.isImminent && !countdown.isPast) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [countdown.isImminent, countdown.isPast, pulseAnim]);
  
  if (countdown.isPast) {
    return null; // Don't render past meetings
  }
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  return (
    <Animated.View style={[
      styles.meetingItem,
      countdown.isImminent && styles.meetingItemImminent,
      { transform: [{ scale: pulseAnim }] }
    ]}>
      <View style={styles.meetingInfo}>
        <Text style={styles.meetingTitle} numberOfLines={1}>
          {meeting.title}
        </Text>
        <View style={styles.meetingMeta}>
          <Text style={styles.meetingTime}>
            {formatTime(meeting.startTime)}
          </Text>
          {meeting.location && (
            <>
              <Text style={styles.metaSeparator}>•</Text>
              <Text style={styles.meetingLocation} numberOfLines={1}>
                {meeting.location}
              </Text>
            </>
          )}
        </View>
      </View>
      
      <View style={styles.countdownContainer}>
        {countdown.hours > 0 && (
          <>
            <View style={styles.countdownUnit}>
              <Text style={[styles.countdownNumber, countdown.isImminent && styles.countdownNumberImminent]}>
                {countdown.hours}
              </Text>
              <Text style={styles.countdownLabel}>h</Text>
            </View>
            <Text style={styles.countdownSeparator}>:</Text>
          </>
        )}
        <View style={styles.countdownUnit}>
          <Text style={[styles.countdownNumber, countdown.isImminent && styles.countdownNumberImminent]}>
            {pad(countdown.minutes)}
          </Text>
          <Text style={styles.countdownLabel}>m</Text>
        </View>
        <Text style={styles.countdownSeparator}>:</Text>
        <View style={styles.countdownUnit}>
          <Text style={[
            styles.countdownNumber, 
            styles.countdownSeconds,
            countdown.isImminent && styles.countdownNumberImminent
          ]}>
            {pad(countdown.seconds)}
          </Text>
          <Text style={styles.countdownLabel}>s</Text>
        </View>
      </View>
    </Animated.View>
  );
}

export function MeetingCountdown({ meetings }: MeetingCountdownProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Update current time every second for header
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  
  // Filter out past meetings
  const upcomingMeetings = meetings.filter(m => m.startTime > new Date());
  
  // Sort by start time
  const sortedMeetings = [...upcomingMeetings].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };
  
  const formatCurrentTime = (date: Date) => {
    return date.toLocaleTimeString([], { 
      hour: 'numeric', 
      minute: '2-digit',
      second: '2-digit'
    });
  };
  
  if (sortedMeetings.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.dateText}>{formatDate(currentTime)}</Text>
          <Text style={styles.timeText}>{formatCurrentTime(currentTime)}</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={32} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No upcoming meetings today</Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.dateText}>{formatDate(currentTime)}</Text>
        <Text style={styles.timeText}>{formatCurrentTime(currentTime)}</Text>
      </View>
      
      <View style={styles.meetingsList}>
        {sortedMeetings.slice(0, 5).map((meeting) => (
          <MeetingItem key={meeting.id} meeting={meeting} />
        ))}
        {sortedMeetings.length > 5 && (
          <Text style={styles.moreText}>
            +{sortedMeetings.length - 5} more meetings
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateText: {
    fontSize: typography.lg,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  timeText: {
    fontSize: typography.xl,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
  meetingsList: {
    gap: spacing.sm,
  },
  meetingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  meetingItemImminent: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  meetingInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  meetingTitle: {
    fontSize: typography.base,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  meetingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meetingTime: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  metaSeparator: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    marginHorizontal: spacing.xs,
  },
  meetingLocation: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    flex: 1,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  countdownUnit: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  countdownNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  countdownNumberImminent: {
    color: colors.primary,
  },
  countdownSeconds: {
    minWidth: 28,
    textAlign: 'right',
  },
  countdownLabel: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    marginLeft: 1,
  },
  countdownSeparator: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textTertiary,
    marginHorizontal: 2,
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: typography.base,
    color: colors.textTertiary,
  },
  moreText: {
    fontSize: typography.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
