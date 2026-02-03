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
      title: 'ACS Talk',
      startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30),
      location: 'Orlando Convention Center',
    },
    {
      id: '2', 
      title: 'Cardiovascular Dept. Meeting',
      startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 30),
      location: 'Virtual',
    },
    {
      id: '3',
      title: 'Flight to San Francisco',
      startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 17),
      location: 'MCO → SFO (AS 369)',
    },
    {
      id: '4',
      title: 'SPARC Plug-in Office Hours',
      startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0),
      location: 'Virtual',
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
  
  // Convert to the format MeetingCountdown expects
  const meetings = todayEvents.map(event => ({
    id: event.id,
    title: event.title,
    startTime: event.startTime,
    location: event.location,
  }));

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
        
        <MeetingCountdown meetings={meetings} />
        
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
