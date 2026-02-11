import React, { useRef, useEffect, useState, useCallback } from 'react';
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
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useNetworkStore } from '../../src/stores/networkStore';
import { useCalendar } from '../../src/hooks/useCalendar';
import { Avatar } from '../../src/components/Avatar';
import { ChatMessage } from '../../src/components/ChatMessage';
import { ImagePickerModal } from '../../src/components/ImagePicker';
import { NextMeeting } from '../../src/components/NextMeeting';
import { NetworkIndicator } from '../../src/components/NetworkIndicator';
import { ToastContainer } from '../../src/components/ToastContainer';
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
  
  const { messages, avatarState, isConnected: storeConnected, setAvatarState, addMessage, updateMessage, setConnected } = useChatStore();
  const { accessToken } = useAuthStore();
  const { refresh: refreshCalendar } = useCalendar();
  const { isConnected, isLoading: gatewayLoading, sendMessage: gatewaySend, checkConnection } = useGateway();
  const { setConnected: setNetworkConnected, addToast } = useNetworkStore();
  
  // Sync connection status to stores
  useEffect(() => {
    setConnected(isConnected);
    setNetworkConnected(isConnected);
  }, [isConnected, setConnected, setNetworkConnected]);

  // Fetch real calendar data when connected
  useEffect(() => {
    if (isConnected) {
      refreshCalendar();
    }
  }, [isConnected]);

  const { voiceEnabled, autoPlayResponses } = useSettingsStore();
  const { 
    isRecording, 
    audioLevel,
    isTranscribing,
    isLoadingAudio,
    isSpeaking,
    startRecording, 
    stopRecording, 
    speak,
    stopSpeaking,
    isConfigured: voiceConfigured,
  } = useVoiceChat();

  // Sync avatar state with voice chat state
  // - isLoadingAudio: show 'thinking' (fetching audio from ElevenLabs)
  // - isSpeaking: show 'speaking' (audio is actually playing)
  // - neither: idle (unless something else set it)
  useEffect(() => {
    if (isSpeaking) {
      setAvatarState('speaking');
    } else if (isLoadingAudio) {
      setAvatarState('thinking');
    } else if (avatarState === 'speaking') {
      // Audio just finished
      setAvatarState('idle');
    }
  }, [isSpeaking, isLoadingAudio, avatarState, setAvatarState]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Scroll to bottom on initial load (after persisted messages are loaded)
  useEffect(() => {
    if (messages.length > 0) {
      // Longer delay for initial load to ensure content is rendered
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 300);
    }
  }, []); // Empty deps = only run on mount

  const sendMessageToGateway = async (content: string, retryMessageId?: string) => {
    console.log('[Chat] sendMessageToGateway called with:', content);
    
    let messageId: string;
    
    if (retryMessageId) {
      // Retry existing message
      messageId = retryMessageId;
      updateMessage(messageId, { status: 'sending' });
    } else {
      // Add new user message to chat
      messageId = Date.now().toString();
      const userMessage: Message = {
        id: messageId,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        status: 'sending',
      };
      addMessage(userMessage);
    }
    
    setAvatarState('thinking');
    
    // Send to Gateway and get response
    console.log('[Chat] Calling gatewaySend...');
    const response = await gatewaySend(content);
    console.log('[Chat] Gateway response:', response);
    
    if (response) {
      // Mark user message as sent
      updateMessage(messageId, { status: 'sent' });
      
      // Add assistant response to chat
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      addMessage(assistantMessage);
      console.log('[Chat] Added assistant message to chat');
      
      // Speak the response if voice is enabled
      // Avatar state will be managed by useEffect based on isLoadingAudio/isSpeaking
      if (voiceEnabled && autoPlayResponses) {
        try {
          await speak(response);
          // Don't set idle here - useEffect handles it when speaking ends
          return;
        } catch (e) {
          console.error('[Chat] TTS error:', e);
        }
      }
    } else {
      console.log('[Chat] No response received from Gateway');
      // Mark message as failed
      updateMessage(messageId, { status: 'failed' });
      addToast({
        message: 'Failed to send message. Tap to retry.',
        type: 'error',
        duration: 5000,
      });
    }
    
    setAvatarState('idle');
  };

  // Handle message retry
  const handleRetryMessage = useCallback((messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message && message.status === 'failed') {
      sendMessageToGateway(message.content, messageId);
    }
  }, [messages]);

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

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatMessage message={item} onRetry={handleRetryMessage} />
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
      
      {/* Toast notifications */}
      <ToastContainer />
      
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
          
          <View style={{ height: spacing.lg }} />
          
          {/* Status info */}
          {isRecording ? (
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: colors.error }]} />
              <Text style={styles.statusText}>Listening...</Text>
            </View>
          ) : isTranscribing ? (
            <View style={styles.statusContainer}>
              <Text style={styles.statusText}>Transcribing...</Text>
            </View>
          ) : gatewayLoading ? (
            <View style={styles.statusContainer}>
              <Text style={styles.statusText}>Thinking...</Text>
            </View>
          ) : isLoadingAudio ? (
            <View style={styles.statusContainer}>
              <Text style={styles.statusText}>Preparing voice...</Text>
            </View>
          ) : isSpeaking ? (
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.statusText}>Speaking...</Text>
            </View>
          ) : (
            <View style={styles.statusContainer}>
              <NetworkIndicator compact />
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
