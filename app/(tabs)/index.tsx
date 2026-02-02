import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useChatStore } from '../../src/stores/chatStore';
import { useAuthStore } from '../../src/stores/authStore';
import { Avatar } from '../../src/components/Avatar';
import { ChatMessage } from '../../src/components/ChatMessage';
import { ChatInput } from '../../src/components/ChatInput';
import { useWebSocket } from '../../src/lib/websocket';
import type { Message } from '../../src/types';

export default function ChatScreen() {
  const flatListRef = useRef<FlatList>(null);
  const { messages, avatarState } = useChatStore();
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
    // For now, send as placeholder
    sendMessage('[Voice message]', uri);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatMessage message={item} />
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* Header with Avatar */}
        <View style={styles.header}>
          <Avatar state={avatarState} size={60} />
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
        />

        {/* Input */}
        <ChatInput
          onSendText={handleSendText}
          onSendAudio={handleSendAudio}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 8,
  },
});
