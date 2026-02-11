import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { useCalendarStore, CalendarEvent } from '../stores/calendarStore';
import { MeetingDetail } from './MeetingDetail';

interface NextMeetingProps {
  onExpand?: () => void;
}

type MeetingStatus = 'now' | 'imminent' | 'upcoming' | 'later' | 'tomorrow' | 'free';

export function NextMeeting({ onExpand }: NextMeetingProps) {
  const { events, isBackgroundRefreshing } = useCalendarStore();
  const [expanded, setExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  
  // Animation for urgent pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Helper to safely get Date
  const toDate = (d: Date | string): Date => {
    if (d instanceof Date) return d;
    return new Date(d);
  };

  // Get next meeting and its status
  const getNextMeeting = (): { event: CalendarEvent | null; status: MeetingStatus } => {
    if (!events || events.length === 0) {
      return { event: null, status: 'free' };
    }

    const now = currentTime;
    const sortedEvents = [...events]
      .filter(e => toDate(e.startTime).getTime() >= now.getTime() - 60 * 60 * 1000)
      .sort((a, b) => toDate(a.startTime).getTime() - toDate(b.startTime).getTime());

    if (sortedEvents.length === 0) {
      return { event: null, status: 'free' };
    }

    const nextEvent = sortedEvents[0];
    const startTime = toDate(nextEvent.startTime);
    const endTime = nextEvent.endTime 
      ? toDate(nextEvent.endTime)
      : new Date(startTime.getTime() + 60 * 60 * 1000);
    const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));

    if (now >= startTime && now < endTime) {
      return { event: nextEvent, status: 'now' };
    }
    if (minutesUntil > 0 && minutesUntil <= 15) {
      return { event: nextEvent, status: 'imminent' };
    }
    if (minutesUntil > 15 && minutesUntil <= 120) {
      return { event: nextEvent, status: 'upcoming' };
    }
    
    const isToday = startTime.toDateString() === now.toDateString();
    if (isToday) {
      return { event: nextEvent, status: 'later' };
    }

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (startTime.toDateString() === tomorrow.toDateString()) {
      return { event: nextEvent, status: 'tomorrow' };
    }

    return { event: null, status: 'free' };
  };

  const { event: nextEvent, status } = getNextMeeting();

  // Pulse animation for imminent meetings
  useEffect(() => {
    if (status === 'imminent' || status === 'now') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.02,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.4,
              duration: 1000,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1000,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.1,
              duration: 1000,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulse.start();
      return () => {
        pulse.stop();
        pulseAnim.setValue(1);
        glowOpacity.setValue(0);
      };
    }
  }, [status]);

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatTimeDisplay = (): string => {
    if (!nextEvent) return '';
    
    const startTime = toDate(nextEvent.startTime);
    const now = currentTime;
    const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));

    switch (status) {
      case 'now':
        return 'NOW';
      case 'imminent':
        return minutesUntil <= 1 ? 'In 1 min' : `In ${minutesUntil} min`;
      case 'upcoming':
        if (minutesUntil < 60) return `In ${minutesUntil} min`;
        const hours = Math.floor(minutesUntil / 60);
        const mins = minutesUntil % 60;
        return mins === 0 ? `In ${hours}h` : `In ${hours}h ${mins}m`;
      case 'later':
        return formatTime(startTime);
      case 'tomorrow':
        return `Tomorrow ${formatTime(startTime)}`;
      default:
        return '';
    }
  };

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(!expanded);
    onExpand?.();
  };

  const handleMeetingTap = async (event: CalendarEvent) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedEvent(event);
    setShowDetail(true);
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
    setSelectedEvent(null);
  };

  const getTodayEvents = (): CalendarEvent[] => {
    if (!events || events.length === 0) return [];
    
    const now = currentTime;
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    
    return events
      .filter(e => {
        const start = toDate(e.startTime);
        return start >= now && start <= endOfDay;
      })
      .sort((a, b) => toDate(a.startTime).getTime() - toDate(b.startTime).getTime())
      .slice(0, 5);
  };

  const todayEvents = expanded ? getTodayEvents() : [];

  const getStatusColor = () => {
    switch (status) {
      case 'now': return colors.warning;
      case 'imminent': return colors.primary;
      default: return colors.textSecondary;
    }
  };

  // "You're free" state
  if (status === 'free') {
    return (
      <View style={styles.container}>
        <Text style={styles.freeText}>You're free ✨</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
        {/* Glow background for urgent meetings */}
        {(status === 'imminent' || status === 'now') && (
          <Animated.View 
            style={[
              styles.glowBackground,
              { opacity: glowOpacity }
            ]} 
          />
        )}
        
        {/* Main single line */}
        <View style={styles.mainLine}>
          {isBackgroundRefreshing && (
            <ActivityIndicator 
              size="small" 
              color={colors.primary} 
              style={styles.refreshIndicator}
            />
          )}
          <Text style={[styles.timeText, { color: getStatusColor() }]}>
            {formatTimeDisplay()}
          </Text>
          <Text style={styles.separator}>·</Text>
          <TouchableOpacity 
            style={styles.titleTouchable} 
            onPress={() => nextEvent && handleMeetingTap(nextEvent)}
            activeOpacity={0.7}
          >
            <Text style={styles.titleText} numberOfLines={1} ellipsizeMode="tail">
              {nextEvent?.title || 'No title'}
            </Text>
          </TouchableOpacity>
          <Ionicons 
            name={expanded ? 'chevron-up' : 'chevron-down'} 
            size={14} 
            color={colors.textTertiary} 
            style={styles.chevron}
          />
        </View>

        {/* Expanded view */}
        {expanded && todayEvents.length > 1 && (
          <View style={styles.expandedContainer}>
            {todayEvents.slice(1).map((event) => (
              <TouchableOpacity 
                key={event.id} 
                style={styles.expandedRow}
                onPress={() => handleMeetingTap(event)}
                activeOpacity={0.7}
              >
                <Text style={styles.expandedTime}>
                  {formatTime(toDate(event.startTime))}
                </Text>
                <Text style={styles.expandedTitle} numberOfLines={1}>
                  {event.title}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        {expanded && todayEvents.length <= 1 && (
          <View style={styles.expandedContainer}>
            <Text style={styles.noMoreText}>No more meetings today</Text>
          </View>
        )}
      </Animated.View>

      {/* Meeting Detail Modal */}
      {selectedEvent && (
        <MeetingDetail
          event={selectedEvent}
          visible={showDetail}
          onClose={handleCloseDetail}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    width: '90%',
  },
  glowBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primaryGlow,
    borderRadius: borderRadius.md,
  },
  mainLine: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  refreshIndicator: {
    marginRight: spacing.xs,
    transform: [{ scale: 0.7 }],
  },
  timeText: {
    fontSize: typography.sm,
    fontWeight: '600',
    flexShrink: 0,
  },
  separator: {
    color: colors.textTertiary,
    fontSize: typography.sm,
    flexShrink: 0,
    marginHorizontal: spacing.xs,
  },
  titleTouchable: {
    flex: 1,
    minWidth: 100,
  },
  titleText: {
    fontSize: typography.sm,
    color: colors.textPrimary,
  },
  chevron: {
    marginLeft: spacing.xs,
    flexShrink: 0,
  },
  freeText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  expandedContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    width: '100%',
  },
  expandedTime: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    width: 60,
    flexShrink: 0,
    marginRight: spacing.sm,
  },
  expandedTitle: {
    flex: 1,
    fontSize: typography.xs,
    color: colors.textSecondary,
    minWidth: 80,
  },
  noMoreText: {
    fontSize: typography.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
});
