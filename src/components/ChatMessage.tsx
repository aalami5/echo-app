import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isFromMe = message.isFromMe;

  return (
    <View style={[styles.container, isFromMe ? styles.fromMe : styles.fromEcho]}>
      <View style={[styles.bubble, isFromMe ? styles.bubbleFromMe : styles.bubbleFromEcho]}>
        <Text style={[styles.text, isFromMe ? styles.textFromMe : styles.textFromEcho]}>
          {message.text}
        </Text>
        {message.streaming && (
          <Text style={styles.streaming}>●●●</Text>
        )}
      </View>
      <Text style={styles.timestamp}>
        {new Date(message.timestamp).toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  fromMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  fromEcho: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bubbleFromMe: {
    backgroundColor: '#6366f1',
  },
  bubbleFromEcho: {
    backgroundColor: '#2a2a2a',
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  textFromMe: {
    color: '#fff',
  },
  textFromEcho: {
    color: '#fff',
  },
  timestamp: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    marginHorizontal: 4,
  },
  streaming: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
});
