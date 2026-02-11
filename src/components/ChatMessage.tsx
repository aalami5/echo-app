import React from 'react';
import { StyleSheet, View, Text, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { Message, MessageStatus } from '../types';
import { colors, spacing, borderRadius } from '../constants/theme';
import { useScaledTypography } from '../hooks/useScaledTypography';

interface ChatMessageProps {
  message: Message;
  onRetry?: (messageId: string) => void;
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

export function ChatMessage({ message, onRetry }: ChatMessageProps) {
  const isFromUser = message.role === 'user';
  const typography = useScaledTypography();

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

  return (
    <View style={[styles.container, isFromUser ? styles.fromUser : styles.fromEcho]}>
      <View style={[
        styles.bubble,
        isFromUser ? styles.bubbleFromUser : styles.bubbleFromEcho,
        message.status === 'failed' && styles.bubbleFailed,
      ]}>
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
            <Text style={textStyle} selectable>{message.content}</Text>
            {message.streaming && <StreamingIndicator />}
          </LinearGradient>
        ) : (
          <View style={styles.echoBubble}>
            {message.imageUrl && (
              <Image source={{ uri: message.imageUrl }} style={styles.messageImage} />
            )}
            <Text style={textStyle} selectable>{message.content}</Text>
            {message.streaming && <StreamingIndicator />}
          </View>
        )}
      </View>
      <View style={[styles.metaRow, isFromUser && styles.metaRowRight]}>
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

function StreamingIndicator() {
  return (
    <View style={styles.streamingContainer}>
      <View style={[styles.dot, styles.dot1]} />
      <View style={[styles.dot, styles.dot2]} />
      <View style={[styles.dot, styles.dot3]} />
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
  streamingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    opacity: 0.6,
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.6,
  },
  dot3: {
    opacity: 0.8,
  },
});
