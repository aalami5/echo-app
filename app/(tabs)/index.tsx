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
  AppState,
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
import { MessageDetailSheet } from '../../src/components/MessageDetailSheet';
import { ImagePickerModal } from '../../src/components/ImagePicker';
import { NextMeeting } from '../../src/components/NextMeeting';
import { NetworkIndicator } from '../../src/components/NetworkIndicator';
import { ToastContainer } from '../../src/components/ToastContainer';
import { useGateway, LONG_TASK_MARKER } from '../../src/hooks/useGateway';
import { useVoiceChat } from '../../src/hooks/useVoiceChat';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';
import type { Message } from '../../src/types';
import {
  drainPendingGatewayResponses,
  listPendingGatewayRequests,
  processPendingGatewayRequests,
  removePendingGatewayRequest,
} from '../../src/services/gatewayBackground';

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  
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

  // For inverted FlatList, we reverse the messages so newest appears at top of reversed list (bottom of screen)
  const reversedMessages = [...messages].reverse();

  // Track last message to detect new ones
  const lastMessageId = useRef<string | null>(null);
  const userScrolledUp = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((animated = true) => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length === 0) return;
    
    const latestMessage = messages[messages.length - 1];
    const isNewMessage = latestMessage.id !== lastMessageId.current;
    
    if (isNewMessage) {
      lastMessageId.current = latestMessage.id;
      
      // Always scroll to bottom for new messages
      // Small delay to ensure content is rendered
      setTimeout(() => {
        scrollToBottom(true);
      }, 100);
      
      // Reset user scroll flag when they send a message
      if (latestMessage.role === 'user') {
        userScrolledUp.current = false;
      }
      
      // Auto-play TTS for new assistant messages from notifications/sync
      // (Live chat responses already call speak() directly in sendMessageToGateway)
      if (
        latestMessage.role === 'assistant' &&
        voiceEnabled &&
        autoPlayResponses &&
        voiceConfigured &&
        latestMessage.content &&
        !latestMessage.content.startsWith('Failed to') &&
        !isSpeaking &&
        !isLoadingAudio
      ) {
        // Check if this message came from notification sync (not live chat)
        // Live chat messages have status transitions; notification messages don't
        if (!latestMessage.status) {
          console.log('[Chat] Auto-playing TTS for notification message:', latestMessage.id);
          speak(latestMessage.content).catch(() => {
            addToast({
              message: '🔇 Voice failed — check ElevenLabs API key in Settings',
              type: 'warning',
              duration: 4000,
            });
          });
        }
      }
    }
  }, [messages, scrollToBottom, voiceEnabled, autoPlayResponses, voiceConfigured, speak, isSpeaking, isLoadingAudio]);

  // Scroll to bottom on initial mount
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollToBottom(false);
      }, 300);
    }
  }, []);

  // Handle scroll to detect if user scrolled up manually
  const handleScroll = useCallback((event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    // In inverted list, offset > 100 means user scrolled up to see older messages
    if (offsetY > 100) {
      userScrolledUp.current = true;
    } else {
      userScrolledUp.current = false;
    }
  }, []);

  const applyPendingResponses = useCallback(async () => {
    const pendingResponses = await drainPendingGatewayResponses();
    if (pendingResponses.length === 0) return;

    for (const response of pendingResponses) {
      updateMessage(response.requestId, { status: 'sent' });
      const assistantMessage: Message = {
        id: (Date.now() + Math.random()).toString(),
        role: 'assistant',
        content: response.content,
        timestamp: response.createdAt,
      };
      addMessage(assistantMessage);
    }
  }, [addMessage, updateMessage]);

  const recoverPendingRequests = useCallback(async () => {
    const pendingRequests = await listPendingGatewayRequests();
    if (pendingRequests.length === 0) return;

    if (gatewayLoading) return;

    const responses = await processPendingGatewayRequests();
    if (responses.length > 0) {
      await applyPendingResponses();
    }

    // Mark any still-pending requests as failed so user can retry
    const remaining = await listPendingGatewayRequests();
    for (const request of remaining) {
      updateMessage(request.id, { status: 'failed' });
      await removePendingGatewayRequest(request.id);
    }
  }, [applyPendingResponses, gatewayLoading, updateMessage]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        await checkConnection();
        await applyPendingResponses();
        await recoverPendingRequests();
      }
    });

    return () => subscription.remove();
  }, [applyPendingResponses, checkConnection, recoverPendingRequests]);

  useEffect(() => {
    applyPendingResponses();
    recoverPendingRequests();
  }, [applyPendingResponses, recoverPendingRequests]);

  const sendMessageToGateway = async (
    content: string, 
    retryMessageId?: string,
    image?: { base64: string; mimeType: string }
  ) => {
    console.log('[Chat] sendMessageToGateway called with:', content);
    console.log('[Chat] Has image:', !!image);
    
    let userMessageId: string;
    
    if (retryMessageId) {
      // Retry existing message
      userMessageId = retryMessageId;
      updateMessage(userMessageId, { status: 'sending' });
    } else {
      // Add new user message to chat immediately
      userMessageId = Date.now().toString();
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        status: 'sending',
      };
      addMessage(userMessage);
    }
    
    setAvatarState('thinking');
    
    // Create assistant placeholder immediately with acknowledgment message
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: 'Got it, working on this...',
      timestamp: new Date().toISOString(),
      status: 'thinking',  // Mark as thinking for UI indicator
    };
    addMessage(assistantPlaceholder);
    console.log('[Chat] Added thinking placeholder message');
    
    // Send to Gateway (non-streaming, waits for complete response)
    console.log('[Chat] Calling gatewaySend...');
    const response = await gatewaySend(content, userMessageId, image);
    console.log('[Chat] Response received, length:', response?.length || 0);
    
    if (response === LONG_TASK_MARKER) {
      // Build 19: Long task - still working in background
      console.log('[Chat] Long task detected - updating placeholder');
      updateMessage(userMessageId, { status: 'sent' });
      updateMessage(assistantMessageId, { 
        content: "Working on this... I'll notify you when ready 🔔",
        status: undefined,  // Remove thinking status (stops loading indicator)
      });
      // Don't show error - response will arrive via push notification
    } else if (response) {
      // Mark user message as sent
      updateMessage(userMessageId, { status: 'sent' });
      
      // Replace placeholder with actual response
      updateMessage(assistantMessageId, { 
        content: response, 
        status: undefined,  // Remove thinking status
      });
      console.log('[Chat] Updated assistant message with response');
      
      // Speak the response if voice is enabled
      if (voiceEnabled && autoPlayResponses) {
        try {
          await speak(response);
          return;
        } catch (e) {
          console.error('[Chat] TTS error:', e);
          addToast({
            message: '🔇 Voice failed — check ElevenLabs API key in Settings',
            type: 'warning',
            duration: 4000,
          });
        }
      }
    } else {
      console.log('[Chat] No response received from Gateway');
      // Mark user message as failed
      updateMessage(userMessageId, { status: 'failed' });
      // Update placeholder with failure message
      updateMessage(assistantMessageId, { 
        content: 'Failed to get response. Please try again.',
        status: undefined,
      });
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

  const handleImageSelected = async (uri: string, base64?: string, mimeType?: string, caption?: string) => {
    setShowImagePicker(false);
    
    const messageText = caption || 'What do you see in this image?';
    
    // Add image message to chat immediately
    const imageMessageId = Date.now().toString();
    const imageMessage: Message = {
      id: imageMessageId,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
      imageUrl: uri,
      status: 'sending',
    };
    addMessage(imageMessage);
    
    // If we have base64 data, send to gateway for analysis
    if (base64 && mimeType) {
      setAvatarState('thinking');
      
      // Create assistant placeholder
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantPlaceholder: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: 'Analyzing your image...',
        timestamp: new Date().toISOString(),
        status: 'thinking',
      };
      addMessage(assistantPlaceholder);
      
      // Send to gateway with image
      const response = await gatewaySend(
        messageText,
        imageMessageId,
        { base64, mimeType }
      );
      
      if (response === LONG_TASK_MARKER) {
        updateMessage(imageMessageId, { status: 'sent' });
        updateMessage(assistantMessageId, {
          content: "Analyzing image... I'll notify you when ready 🔔",
          status: undefined,
        });
      } else if (response) {
        updateMessage(imageMessageId, { status: 'sent' });
        updateMessage(assistantMessageId, {
          content: response,
          status: undefined,
        });
        
        // Speak response if enabled
        if (voiceEnabled && autoPlayResponses) {
          try {
            await speak(response);
          } catch (e) {
            console.error('[Chat] TTS error:', e);
            addToast({
              message: '🔇 Voice failed — check ElevenLabs API key in Settings',
              type: 'warning',
              duration: 4000,
            });
          }
        }
      } else {
        updateMessage(imageMessageId, { status: 'failed' });
        updateMessage(assistantMessageId, {
          content: 'Failed to analyze image. Please try again.',
          status: undefined,
        });
      }
      
      setAvatarState('idle');
    } else {
      // No base64 available - just mark as sent locally
      updateMessage(imageMessageId, { status: 'sent' });
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I can see you shared an image, but I wasn't able to process it. Try again?",
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleSpeakMessage = useCallback((content: string) => {
    if (voiceConfigured && content) {
      speak(content).catch(() => {
        addToast({
          message: '🔇 Voice failed — check ElevenLabs API key in Settings',
          type: 'warning',
          duration: 4000,
        });
      });
    }
  }, [voiceConfigured, speak, addToast]);

  const handleMessageLongPress = useCallback((message: Message) => {
    setSelectedMessage(message);
  }, []);

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatMessage 
      message={item} 
      onRetry={handleRetryMessage} 
      onSpeak={handleSpeakMessage}
      onLongPress={handleMessageLongPress}
    />
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
          data={reversedMessages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmptyState}
          inverted
          onScroll={handleScroll}
          scrollEventThrottle={100}
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
          }}
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

      {/* Message Detail Sheet - long press to select text */}
      <MessageDetailSheet
        message={selectedMessage}
        visible={selectedMessage !== null}
        onClose={() => setSelectedMessage(null)}
        onSpeak={handleSpeakMessage}
      />
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
