import React, { useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import type { Message } from '../types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.7;

interface MessageDetailSheetProps {
  message: Message | null;
  visible: boolean;
  onClose: () => void;
  onSpeak?: (content: string) => void;
}

export function MessageDetailSheet({ message, visible, onClose, onSpeak }: MessageDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Pan responder for swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to downward swipes
        return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          dismiss();
        } else {
          // Snap back
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [onClose, slideAnim, backdropAnim]);

  const handleSpeak = useCallback(() => {
    if (message?.content && onSpeak) {
      onSpeak(message.content);
      dismiss();
    }
  }, [message, onSpeak, dismiss]);

  const handleCopyReply = useCallback(async () => {
    const replyText = message?.card?.data?.replyText || message?.card?.body || message?.content;
    if (!replyText) return;
    await Clipboard.setStringAsync(String(replyText));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [message]);

  if (!message) return null;

  const isFromUser = message.role === 'user';
  const timestamp = new Date(message.timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: backdropAnim },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={dismiss}
        />
      </Animated.View>

      {/* Sheet */}
      <KeyboardAvoidingView
        style={styles.sheetWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: SHEET_MAX_HEIGHT,
              paddingBottom: insets.bottom + spacing.md,
              transform: [{ translateY: slideAnim }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerLabel}>
                {isFromUser ? 'You' : 'Echo'}
              </Text>
              <Text style={styles.headerTimestamp}>{timestamp}</Text>
            </View>
            <TouchableOpacity onPress={dismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={28} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Selectable message content */}
          <ScrollView
            style={styles.contentScroll}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
            bounces={true}
          >
            <TextInput
              style={styles.selectableText}
              value={message.content}
              editable={false}
              multiline
              scrollEnabled={false}
              contextMenuHidden={false}
              dataDetectorTypes={['link', 'phoneNumber', 'address']}
            />
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.actions}>
            {onSpeak && !isFromUser && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleSpeak}
              >
                <Ionicons name="volume-medium-outline" size={20} color={colors.primary} />
                <Text style={styles.actionText}>Speak</Text>
              </TouchableOpacity>
            )}
            {message.card?.type === 'meeting_reply' && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleCopyReply}
              >
                <Ionicons name="copy-outline" size={20} color={colors.primary} />
                <Text style={styles.actionText}>Copy reply</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerLabel: {
    fontSize: typography.base,
    fontWeight: typography.semibold,
    color: colors.textPrimary,
  },
  headerTimestamp: {
    fontSize: typography.sm,
    color: colors.textTertiary,
  },
  contentScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  selectableText: {
    fontSize: typography.base,
    lineHeight: 24,
    color: colors.textPrimary,
    padding: 0,
    // Ensure the TextInput doesn't look like an input
    backgroundColor: 'transparent',
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  actionText: {
    fontSize: typography.sm,
    color: colors.primary,
    fontWeight: typography.medium,
  },
});
