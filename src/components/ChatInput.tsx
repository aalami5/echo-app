import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Text,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useVoiceRecording } from '../hooks/useVoiceRecording';

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendAudio: (uri: string) => void;
}

export function ChatInput({ onSendText, onSendAudio }: ChatInputProps) {
  const [text, setText] = useState('');
  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecording();

  const handleSend = async () => {
    if (text.trim()) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSendText(text.trim());
      setText('');
    }
  };

  const handleMicPress = async () => {
    if (isRecording) {
      const uri = await stopRecording();
      if (uri) {
        onSendAudio(uri);
      }
    } else {
      await startRecording();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {isRecording ? (
        <View style={styles.recordingContainer}>
          <TouchableOpacity onPress={cancelRecording} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>{formatDuration(duration)}</Text>
          </View>
          <TouchableOpacity onPress={handleMicPress} style={styles.stopButton}>
            <Text style={styles.stopIcon}>⬛</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Message Echo..."
            placeholderTextColor="#666"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
          />
          {text.trim() ? (
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
              <Text style={styles.sendIcon}>↑</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleMicPress}
              onLongPress={handleMicPress}
              style={styles.micButton}
            >
              <Text style={styles.micIcon}>🎤</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#fff',
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#333',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    fontSize: 18,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cancelButton: {
    padding: 8,
  },
  cancelText: {
    color: '#ef4444',
    fontSize: 16,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  recordingTime: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'monospace',
  },
  stopButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    color: '#fff',
    fontSize: 16,
  },
});
