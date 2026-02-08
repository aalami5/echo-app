import React from 'react';
import { StyleSheet, View, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Message } from '../types';
import { colors, spacing, borderRadius } from '../constants/theme';
import { useScaledTypography } from '../hooks/useScaledTypography';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
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

  return (
    <View style={[styles.container, isFromUser ? styles.fromUser : styles.fromEcho]}>
      <View style={[
        styles.bubble,
        isFromUser ? styles.bubbleFromUser : styles.bubbleFromEcho
      ]}>
        {isFromUser ? (
          <LinearGradient
            colors={['#1E3A5F', '#162D4D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientBubble}
          >
            {message.imageUrl && (
              <Image source={{ uri: message.imageUrl }} style={styles.messageImage} />
            )}
            <Text style={textStyle}>{message.content}</Text>
            {message.streaming && <StreamingIndicator />}
          </LinearGradient>
        ) : (
          <View style={styles.echoBubble}>
            {message.imageUrl && (
              <Image source={{ uri: message.imageUrl }} style={styles.messageImage} />
            )}
            <Text style={textStyle}>{message.content}</Text>
            {message.streaming && <StreamingIndicator />}
          </View>
        )}
      </View>
      <Text style={[timestampStyle, isFromUser && styles.timestampRight]}>
        {new Date(message.timestamp).toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}
      </Text>
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
  timestampRight: {
    textAlign: 'right' as const,
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
