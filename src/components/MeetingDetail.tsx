import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { CalendarEvent } from '../stores/calendarStore';

interface MeetingDetailProps {
  event: CalendarEvent;
  visible: boolean;
  onClose: () => void;
}

export function MeetingDetail({ event, visible, onClose }: MeetingDetailProps) {
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleOpenMaps = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (event.locationUrl) {
      Linking.openURL(event.locationUrl);
    } else if (event.location) {
      const query = encodeURIComponent(event.location);
      const url = Platform.select({
        ios: `maps:?q=${query}`,
        android: `geo:0,0?q=${query}`,
        default: `https://www.google.com/maps/search/?api=1&query=${query}`,
      });
      Linking.openURL(url);
    }
  };

  const handleJoinVideo = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (event.videoLink) {
      Linking.openURL(event.videoLink);
    }
  };

  const handleDialIn = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (event.dialIn) {
      const phoneNumber = event.dialIn.replace(/[^0-9+]/g, '');
      const dialCode = event.dialInCode ? `,,${event.dialInCode}` : '';
      Linking.openURL(`tel:${phoneNumber}${dialCode}`);
    }
  };

  const handleClose = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const startTime = event.startTime instanceof Date ? event.startTime : new Date(event.startTime);
  const endTime = event.endTime 
    ? (event.endTime instanceof Date ? event.endTime : new Date(event.endTime))
    : null;

  const getVideoIcon = () => {
    switch (event.videoProvider) {
      case 'zoom': return 'videocam';
      case 'teams': return 'people';
      case 'meet': return 'logo-google';
      default: return 'videocam';
    }
  };

  const getVideoLabel = () => {
    switch (event.videoProvider) {
      case 'zoom': return 'Join Zoom';
      case 'teams': return 'Join Teams';
      case 'meet': return 'Join Meet';
      default: return 'Join Video';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={20} style={styles.backdrop} tint="dark">
        <TouchableOpacity 
          style={styles.backdropTouch} 
          activeOpacity={1} 
          onPress={handleClose}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalWrapper}>
            <View style={styles.container}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title} numberOfLines={2}>
                  {event.title}
                </Text>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Time */}
              <View style={styles.timeSection}>
                <Ionicons name="time-outline" size={18} color={colors.primary} />
                <View style={styles.timeText}>
                  <Text style={styles.dateText}>{formatDate(startTime)}</Text>
                  <Text style={styles.timeRange}>
                    {formatTime(startTime)}
                    {endTime && ` – ${formatTime(endTime)}`}
                  </Text>
                </View>
              </View>

              <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Location */}
                {event.location && (
                  <TouchableOpacity style={styles.actionRow} onPress={handleOpenMaps}>
                    <View style={styles.actionIcon}>
                      <Ionicons name="location-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.actionContent}>
                      <Text style={styles.actionLabel}>Location</Text>
                      <Text style={styles.actionValue} numberOfLines={2}>
                        {event.location}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}

                {/* Video Link */}
                {event.videoLink && (
                  <TouchableOpacity style={styles.actionRow} onPress={handleJoinVideo}>
                    <View style={[styles.actionIcon, styles.videoIcon]}>
                      <Ionicons name={getVideoIcon()} size={20} color="#1a1a2e" />
                    </View>
                    <View style={styles.actionContent}>
                      <Text style={styles.actionLabel}>{getVideoLabel()}</Text>
                      <Text style={styles.actionValueMuted} numberOfLines={1}>
                        Tap to join meeting
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={18} color={colors.primary} />
                  </TouchableOpacity>
                )}

                {/* Dial-in */}
                {event.dialIn && (
                  <TouchableOpacity style={styles.actionRow} onPress={handleDialIn}>
                    <View style={styles.actionIcon}>
                      <Ionicons name="call-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.actionContent}>
                      <Text style={styles.actionLabel}>Dial-in</Text>
                      <Text style={styles.actionValue}>{event.dialIn}</Text>
                      {event.dialInCode && (
                        <Text style={styles.actionValueMuted}>Code: {event.dialInCode}</Text>
                      )}
                    </View>
                    <Ionicons name="call" size={18} color={colors.success} />
                  </TouchableOpacity>
                )}

                {/* Attendees */}
                {event.attendees && event.attendees.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.sectionTitle}>
                        Attendees ({event.attendees.length})
                      </Text>
                    </View>
                    <View style={styles.attendeesList}>
                      {event.attendees.map((attendee, index) => (
                        <View key={index} style={styles.attendeeRow}>
                          <View style={styles.attendeeAvatar}>
                            <Text style={styles.attendeeInitial}>
                              {attendee.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.attendeeName}>{attendee}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Description */}
                {event.description && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.sectionTitle}>Description</Text>
                    </View>
                    <Text style={styles.description}>{event.description}</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropTouch: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: spacing.lg,
  },
  modalWrapper: {
    width: '100%',
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    width: '100%',
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    flex: 1,
    fontSize: typography.lg,
    fontWeight: '600',
    color: colors.textPrimary,
    marginRight: spacing.md,
  },
  closeButton: {
    padding: spacing.xs,
  },
  timeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  timeText: {
    flex: 1,
  },
  dateText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  timeRange: {
    fontSize: typography.base,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  videoIcon: {
    backgroundColor: colors.primary,
  },
  actionContent: {
    flex: 1,
  },
  actionLabel: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  actionValue: {
    fontSize: typography.base,
    color: colors.textPrimary,
  },
  actionValueMuted: {
    fontSize: typography.sm,
    color: colors.textTertiary,
  },
  section: {
    paddingVertical: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  attendeesList: {
    gap: spacing.xs,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  attendeeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  attendeeInitial: {
    fontSize: typography.sm,
    fontWeight: '600',
    color: colors.textInverse,
  },
  attendeeName: {
    fontSize: typography.base,
    color: colors.textPrimary,
  },
  description: {
    fontSize: typography.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
