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
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useChatStore } from '../../src/stores/chatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useCalendarStore } from '../../src/stores/calendarStore';
import { Avatar } from '../../src/components/Avatar';
import { ChatMessage } from '../../src/components/ChatMessage';
import { ImagePickerModal } from '../../src/components/ImagePicker';
import { NextMeeting } from '../../src/components/NextMeeting';
import { useGateway } from '../../src/hooks/useGateway';
import { useVoiceChat } from '../../src/hooks/useVoiceChat';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';
import type { Message } from '../../src/types';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  
  const { messages, avatarState, isConnected: storeConnected, setAvatarState, addMessage, setConnected } = useChatStore();
  const { accessToken } = useAuthStore();
  const { setEvents } = useCalendarStore();
  const { isConnected, isLoading: gatewayLoading, sendMessage: gatewaySend, checkConnection } = useGateway();
  
  // Sync connection status to store
  useEffect(() => {
    setConnected(isConnected);
  }, [isConnected, setConnected]);

  // Initialize mock calendar data for testing
  useEffect(() => {
    const now = new Date();
    const mockEvents = [
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
    setEvents(mockEvents);
  }, [setEvents]);
  const { 
    isRecording, 
    recordingDuration: duration, 
    audioLevel,
    isTranscribing,
    startRecording, 
    stopRecording, 
    cancelRecording,
    isConfigured: voiceConfigured,
  } = useVoiceChat();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const sendMessageToGateway = async (content: string) => {
    console.log('[Chat] sendMessageToGateway called with:', content);
    
    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMessage);
    
    setAvatarState('thinking');
    
    // Send to Gateway and get response
    console.log('[Chat] Calling gatewaySend...');
    const response = await gatewaySend(content);
    console.log('[Chat] Gateway response:', response);
    
    if (response) {
      // Add assistant response to chat
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      addMessage(assistantMessage);
      console.log('[Chat] Added assistant message to chat');
    } else {
      console.log('[Chat] No response received from Gateway');
    }
    
    setAvatarState('idle');
  };

  const handleAvatarPress = async () => {
    if (isRecording) {
      // Stop recording and transcribe with Whisper
      setAvatarState('thinking');
      const transcribedText = await stopRecording();
      if (transcribedText && transcribedText.trim()) {
        // Send the transcribed text to Gateway
        await sendMessageToGateway(transcribedText);
      } else {
        setAvatarState('idle');
      }
    } else {
      // Start recording
      if (!voiceConfigured) {
        // Show alert if API keys not configured
        alert('Please add your OpenAI API key in Settings to use voice input.');
        return;
      }
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
      const message = textMessage.trim();
      setTextMessage('');
      setShowTextInput(false);
      Keyboard.dismiss();
      await sendMessageToGateway(message);
    }
  };

  const toggleTextInput = () => {
    setShowTextInput(!showTextInput);
    if (!showTextInput) {
      // Will show input
    }
  };

  const handleImageSelected = (uri: string, base64?: string) => {
    setShowImagePicker(false);
    // Add image message to chat
    const imageMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: '[Photo for analysis]',
      timestamp: new Date().toISOString(),
      imageUrl: uri,
    };
    addMessage(imageMessage);
    
    // When connected, send for analysis
    // For now just add locally
    setAvatarState('thinking');
    
    // Simulate Echo response about analyzing
    setTimeout(() => {
      setAvatarState('idle');
    }, 1500);
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
          ) : isTranscribing ? (
            <View style={styles.statusContainer}>
              <Text style={styles.statusText}>Transcribing...</Text>
            </View>
          ) : gatewayLoading ? (
            <View style={styles.statusContainer}>
              <Text style={styles.statusText}>Thinking...</Text>
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
                <TouchableOpacity onPress={checkConnection} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          
          {/* Next Meeting - single line below avatar */}
          {!isRecording && <NextMeeting />}
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
            <View style={styles.actionBar}>
              <TouchableOpacity 
                onPress={() => setShowImagePicker(true)} 
                style={styles.actionButton}
              >
                <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
                <Text style={styles.actionButtonText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleTextInput} style={styles.actionButton}>
                <Ionicons name="keypad-outline" size={22} color={colors.textSecondary} />
                <Text style={styles.actionButtonText}>Type</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Image Picker Modal */}
      {showImagePicker && (
        <ImagePickerModal
          onImageSelected={handleImageSelected}
          onCancel={() => setShowImagePicker(false)}
        />
      )}
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
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    padding: spacing.sm,
  },
  actionButton: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  actionButtonText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
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
