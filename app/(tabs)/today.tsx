import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetingCountdown } from '../../src/components/MeetingCountdown';
import { useCalendarStore, getTodayEvents, CalendarEvent } from '../../src/stores/calendarStore';
import { colors, spacing, typography } from '../../src/constants/theme';

// Mock data for testing - will be replaced with real calendar data
function getMockMeetings(): CalendarEvent[] {
  const now = new Date();
  
  return [
    {
      id: '1',
      title: 'Cardiovascular Dept Meeting',
      startTime: new Date(now.getTime() + 12 * 60 * 1000), // 12 min from now
      endTime: new Date(now.getTime() + 72 * 60 * 1000),
      location: 'Sequoia Hospital, 4th Floor Conference Room',
      videoLink: 'https://teams.microsoft.com/meet/296573611616555',
      videoProvider: 'teams' as const,
      dialIn: '+1 916-562-0855',
      dialInCode: '921443547',
      attendees: ['Dr. Dirk Baumann', 'Dr. Sara Wartman', 'Dr. Esther Bae', 'Dr. George Lee'],
      organizer: 'Grace Estevez',
    },
    {
      id: '2', 
      title: 'SPARC Office Hours',
      startTime: new Date(now.getTime() + 3 * 60 * 60 * 1000), // 3 hours from now
      endTime: new Date(now.getTime() + 4 * 60 * 60 * 1000),
      videoLink: 'https://stanford.zoom.us/j/4322086984',
      videoProvider: 'zoom' as const,
      dialIn: '+1 650-724-9799',
      dialInCode: '4322086984',
      description: 'Open office hours for SPARC project questions and updates.',
    },
    {
      id: '3',
      title: 'Stanford Biodesign Review',
      startTime: new Date(now.getTime() + 5 * 60 * 60 * 1000), // 5 hours from now
      endTime: new Date(now.getTime() + 6 * 60 * 60 * 1000),
      location: '318 Campus Drive, E100, Stanford, CA 94305',
      attendees: ['Dr. Aydin Zahedivash', 'Dr. Vishnu Ravi', 'Paul Schmiedmayer'],
      description: 'Quarterly review of digital health initiatives and student projects.',
    },
  ];
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { events, setEvents, isLoading, setLoading } = useCalendarStore();
  const [refreshing, setRefreshing] = React.useState(false);

  // Load mock data on mount (will be replaced with real API call)
  useEffect(() => {
    if (events.length === 0) {
      setEvents(getMockMeetings());
    }
  }, []);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate fetching new data
    setTimeout(() => {
      setEvents(getMockMeetings());
      setRefreshing(false);
    }, 1000);
  }, []);

  const todayEvents = getTodayEvents(events);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.background, '#0D1526', colors.background]}
        style={StyleSheet.absoluteFill}
      />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 100 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.title}>Today</Text>
        
        <MeetingCountdown meetings={todayEvents} />
        
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Pull to refresh • Syncs with your calendar
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.md,
  },
  footerText: {
    fontSize: typography.sm,
    color: colors.textTertiary,
  },
});
