import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatStore } from '../../src/stores/chatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { Avatar } from '../../src/components/Avatar';
import { ChatMessage } from '../../src/components/ChatMessage';
import { ChatInput } from '../../src/components/ChatInput';
import { useWebSocket } from '../../src/lib/websocket';
import { colors, spacing, typography } from '../../src/constants/theme';
import type { Message } from '../../src/types';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const { messages, avatarState, isConnected } = useChatStore();
  const { accessToken } = useAuthStore();
  const { sendMessage } = useWebSocket(accessToken);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSendText = (text: string) => {
    sendMessage(text);
  };

  const handleSendAudio = async (uri: string) => {
    // TODO: Upload audio and send transcription or audio URL
    console.log('Audio recorded:', uri);
    sendMessage('[Voice message]', uri);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatMessage message={item} />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>Welcome back</Text>
      <Text style={styles.emptySubtitle}>
        Send a message or tap the mic to talk
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.background, '#0D1526', colors.background]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header with Avatar */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Avatar state={avatarState} size={80} />
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusDot,
              { backgroundColor: isConnected ? colors.success : colors.textTertiary }
            ]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Online' : 'Connecting...'}
            </Text>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          style={styles.messageList}
          contentContainerStyle={[
            styles.messageListContent,
            messages.length === 0 && styles.emptyListContent,
          ]}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyState}
        />

        {/* Input - Always visible at bottom */}
        <View style={[styles.inputWrapper, { paddingBottom: insets.bottom }]}>
          <ChatInput
            onSendText={handleSendText}
            onSendAudio={handleSendAudio}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: typography.sm,
    color: colors.textSecondary,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.xl,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  inputWrapper: {
    backgroundColor: colors.background,
  },
});
