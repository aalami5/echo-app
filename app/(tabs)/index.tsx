import React, { useRef, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Text,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useChatStore } from '../../src/stores/chatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { Avatar } from '../../src/components/Avatar';
import { ChatMessage } from '../../src/components/ChatMessage';
import { useWebSocket } from '../../src/lib/websocket';
import { useVoiceRecording } from '../../src/hooks/useVoiceRecording';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';
import type { Message } from '../../src/types';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  
  const { messages, avatarState, isConnected, setAvatarState } = useChatStore();
  const { accessToken } = useAuthStore();
  const { sendMessage, retryConnection } = useWebSocket(accessToken);
  const { 
    isRecording, 
    duration, 
    audioLevel,
    startRecording, 
    stopRecording, 
    cancelRecording 
  } = useVoiceRecording();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleAvatarPress = async () => {
    if (isRecording) {
      // Stop recording and send
      const uri = await stopRecording();
      if (uri) {
        setAvatarState('thinking');
        sendMessage('[Voice message]', uri);
      }
    } else {
      // Start recording
      await startRecording();
    }
  };

  const handleCancelRecording = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    cancelRecording();
  };

  const handleSendText = async () => {
    if (textMessage.trim()) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendMessage(textMessage.trim());
      setTextMessage('');
      setShowTextInput(false);
      Keyboard.dismiss();
    }
  };

  const toggleTextInput = () => {
    setShowTextInput(!showTextInput);
    if (!showTextInput) {
      // Will show input
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatMessage message={item} />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptySubtitle}>
        Tap the avatar to start talking
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
        keyboardVerticalOffset={90}
      >
        {/* Header with Interactive Avatar */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Avatar 
            state={isRecording ? 'listening' : avatarState} 
            size={100}
            onPress={handleAvatarPress}
            isRecording={isRecording}
            audioLevel={audioLevel}
          />
          
          {/* Status / Recording info */}
          {isRecording ? (
            <View style={styles.recordingStatus}>
              <Text style={styles.recordingTime}>{formatDuration(duration)}</Text>
              <TouchableOpacity onPress={handleCancelRecording} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.statusContainer}>
              <View style={[
                styles.statusDot,
                { backgroundColor: isConnected ? colors.success : colors.textTertiary }
              ]} />
              <Text style={styles.statusText}>
                {isConnected ? 'Online' : 'Offline'}
              </Text>
              {!isConnected && (
                <TouchableOpacity onPress={retryConnection} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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

        {/* Text input toggle / input area - above tab bar */}
        <View style={[styles.bottomBar, { marginBottom: 85 }]}>
          {showTextInput ? (
            <View style={styles.textInputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder="Type a message..."
                placeholderTextColor={colors.textTertiary}
                value={textMessage}
                onChangeText={setTextMessage}
                multiline
                maxLength={2000}
                autoFocus
              />
              <TouchableOpacity 
                onPress={handleSendText}
                style={[
                  styles.sendButton,
                  !textMessage.trim() && styles.sendButtonDisabled
                ]}
                disabled={!textMessage.trim()}
              >
                <Ionicons 
                  name="arrow-up" 
                  size={20} 
                  color={textMessage.trim() ? colors.textInverse : colors.textTertiary} 
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleTextInput} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={toggleTextInput} style={styles.keyboardToggle}>
              <Ionicons name="keypad-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.keyboardToggleText}>Type instead</Text>
            </TouchableOpacity>
          )}
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
  retryButton: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
  },
  retryText: {
    fontSize: typography.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  recordingTime: {
    fontSize: typography.xl,
    fontWeight: '600',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  cancelButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.error + '20',
    borderRadius: borderRadius.md,
  },
  cancelText: {
    color: colors.error,
    fontWeight: '500',
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
  emptySubtitle: {
    fontSize: typography.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  bottomBar: {
    padding: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  keyboardToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  keyboardToggleText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
  },
  textInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderFocused,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  textInput: {
    flex: 1,
    fontSize: typography.base,
    color: colors.textPrimary,
    maxHeight: 100,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
});
