import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Image, ActivityIndicator, TouchableOpacity, Animated, Easing, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import type { Message, MessageStatus, RichCard, MeetingReplySlot } from '../types';
import { colors, spacing, borderRadius } from '../constants/theme';
import { useScaledTypography } from '../hooks/useScaledTypography';

interface ChatMessageProps {
  message: Message;
  onRetry?: (messageId: string) => void;
  onSpeak?: (content: string) => void;
  onLongPress?: (message: Message) => void;
}

function MessageStatusIndicator({ 
  status, 
  onRetry 
}: { 
  status?: MessageStatus; 
  onRetry?: () => void;
}) {
  if (!status) return null;
  
  switch (status) {
    case 'sending':
      return (
        <View style={styles.statusIndicator}>
          <ActivityIndicator size={10} color={colors.textTertiary} />
        </View>
      );
    case 'sent':
      return (
        <View style={styles.statusIndicator}>
          <Ionicons name="checkmark" size={12} color={colors.textTertiary} />
        </View>
      );
    case 'failed':
      return (
        <TouchableOpacity 
          onPress={onRetry} 
          style={styles.statusIndicator}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <Text style={styles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      );
    default:
      return null;
  }
}

export function ChatMessage({ message, onRetry, onSpeak, onLongPress }: ChatMessageProps) {
  const isFromUser = message.role === 'user';
  const typography = useScaledTypography();
  const meetingReplyCard = message.card?.type === 'meeting_reply' ? message.card : null;

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.(message);
  };

  // Dynamic text styles based on user's text scale preference
  const textStyle = {
    fontSize: typography.base,
    lineHeight: typography.lineHeight.base,
    color: colors.textPrimary,
  };

  const timestampStyle = {
    fontSize: typography.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginHorizontal: spacing.xs,
  };

  const handleRetry = () => {
    onRetry?.(message.id);
  };

  const handleSpeak = () => {
    if (message.content && onSpeak) {
      onSpeak(message.content);
    }
  };

  return (
    <View style={[styles.container, isFromUser ? styles.fromUser : styles.fromEcho]}>
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
        style={[
          styles.bubble,
          isFromUser ? styles.bubbleFromUser : styles.bubbleFromEcho,
          message.status === 'failed' && styles.bubbleFailed,
        ]}
      >
        {isFromUser ? (
          <LinearGradient
            colors={message.status === 'failed' ? ['#3D1A1A', '#2D1515'] : ['#1E3A5F', '#162D4D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBubble}
          >
            {message.imageUrl && (
              <Image source={{ uri: message.imageUrl }} style={styles.messageImage} />
            )}
            <Text style={textStyle}>{message.content}</Text>
          </LinearGradient>
        ) : (
          <View style={styles.echoBubble}>
            {message.imageUrl && (
              <Image source={{ uri: message.imageUrl }} style={styles.messageImage} />
            )}
            {/* Show thinking indicator when status is 'thinking' */}
            {message.status === 'thinking' ? (
              <ThinkingIndicator message={message.content} />
            ) : meetingReplyCard ? (
              <MeetingReplyCard card={meetingReplyCard} />
            ) : (
              <Text style={textStyle}>{message.content}</Text>
            )}
          </View>
        )}
      </Pressable>
      <View style={[styles.metaRow, isFromUser && styles.metaRowRight]}>
        {!isFromUser && onSpeak && (
          <TouchableOpacity
            onPress={handleSpeak}
            style={styles.speakerButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="volume-medium-outline" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
        <Text style={timestampStyle}>
          {new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </Text>
        {isFromUser && (
          <MessageStatusIndicator 
            status={message.status} 
            onRetry={handleRetry}
          />
        )}
      </View>
    </View>
  );
}

function MeetingReplyCard({ card }: { card: RichCard }) {
  const suggestions = Array.isArray(card.data?.suggestions)
    ? (card.data?.suggestions as MeetingReplySlot[])
    : [];
  const conflictSummary = Array.isArray(card.data?.conflictSummary)
    ? (card.data?.conflictSummary as string[])
    : [];
  const replyText = card.data?.replyText || card.body || '';
  const duration = typeof card.data?.durationMinutes === 'number' ? card.data.durationMinutes : undefined;
  const windowLabel = typeof card.data?.windowLabel === 'string' ? card.data.windowLabel : undefined;

  const handleCopy = async () => {
    if (!replyText) return;
    await Clipboard.setStringAsync(replyText);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={styles.meetingCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIconWrap}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
          {!!card.subtitle && <Text style={styles.cardSubtitle}>{card.subtitle}</Text>}
        </View>
      </View>

      <View style={styles.cardMetaRow}>
        {!!windowLabel && (
          <View style={styles.metaPill}>
            <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.metaPillText}>{windowLabel}</Text>
          </View>
        )}
        {!!duration && (
          <View style={styles.metaPill}>
            <Ionicons name="hourglass-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.metaPillText}>{duration} min</Text>
          </View>
        )}
      </View>

      {suggestions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Suggested times</Text>
          {suggestions.map((slot) => (
            <View key={slot.start} style={styles.slotRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.slotText}>{slot.label}</Text>
            </View>
          ))}
        </View>
      )}

      {conflictSummary.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Conflicts checked</Text>
          {conflictSummary.slice(0, 3).map((conflict) => (
            <View key={conflict} style={styles.conflictRow}>
              <Ionicons name="remove-circle-outline" size={15} color={colors.warning} />
              <Text style={styles.conflictText} numberOfLines={2}>{conflict}</Text>
            </View>
          ))}
        </View>
      )}

      {!!replyText && (
        <View style={styles.replyPreview}>
          <Text style={styles.replyPreviewText} numberOfLines={6}>{replyText}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
        <Ionicons name="copy-outline" size={17} color={colors.textInverse} />
        <Text style={styles.copyButtonText}>Copy reply</Text>
      </TouchableOpacity>
    </View>
  );
}

function ThinkingIndicator({ message }: { message: string }) {
  // Animated opacity for pulsing effect
  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.5,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.thinkingContainer}>
      <Animated.Text style={[styles.thinkingText, { opacity: pulseAnim }]}>
        {message}
      </Animated.Text>
      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
        <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
        <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
    maxWidth: '85%',
  },
  fromUser: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  fromEcho: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  bubbleFromUser: {
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleFromEcho: {
    borderBottomLeftRadius: borderRadius.sm,
  },
  bubbleFailed: {
    opacity: 0.8,
  },
  gradientBubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  echoBubble: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    borderBottomLeftRadius: borderRadius.sm,
  },
  meetingCard: {
    width: 280,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.borderFocused,
  },
  cardHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceElevated,
  },
  metaPillText: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  slotText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  conflictRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  conflictText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  replyPreview: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(11, 17, 32, 0.42)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  replyPreviewText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  copyButton: {
    minHeight: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  copyButtonText: {
    fontSize: 14,
    color: colors.textInverse,
    fontWeight: '700',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRowRight: {
    justifyContent: 'flex-end',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
    gap: 4,
  },
  retryText: {
    fontSize: 10,
    color: colors.error,
  },
  speakerButton: {
    padding: spacing.xs,
    marginRight: spacing.xs,
  },
  thinkingContainer: {
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  thinkingText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
});
