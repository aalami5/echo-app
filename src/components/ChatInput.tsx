import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/theme';

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendAudio: (uri: string) => void;
}

export function ChatInput({ onSendText, onSendAudio }: ChatInputProps) {
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useVoiceRecording();
  
  const recordingPulse = useRef(new Animated.Value(1)).current;
  const micScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      // Pulse animation while recording
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingPulse, {
            toValue: 1.2,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(recordingPulse, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      recordingPulse.setValue(1);
    }
  }, [isRecording]);

  const handleSend = async () => {
    if (text.trim()) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSendText(text.trim());
      setText('');
    }
  };

  const handleMicPressIn = async () => {
    Animated.spring(micScale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handleMicPressOut = async () => {
    Animated.spring(micScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
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

  if (isRecording) {
    return (
      <View style={styles.container}>
        <View style={styles.recordingContainer}>
          {/* Cancel button */}
          <TouchableOpacity 
            onPress={cancelRecording} 
            style={styles.cancelButton}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          {/* Recording indicator */}
          <View style={styles.recordingIndicator}>
            <Animated.View 
              style={[
                styles.recordingDot,
                { transform: [{ scale: recordingPulse }] }
              ]} 
            />
            <Text style={styles.recordingTime}>{formatDuration(duration)}</Text>
          </View>

          {/* Stop button */}
          <TouchableOpacity 
            onPress={handleMicPress} 
            style={styles.stopButton}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryMuted]}
              style={styles.stopButtonGradient}
            >
              <Ionicons name="stop" size={20} color={colors.textInverse} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[
        styles.inputContainer,
        isFocused && styles.inputContainerFocused
      ]}>
        <TextInput
          style={styles.input}
          placeholder="Message Echo..."
          placeholderTextColor={colors.textTertiary}
          value={text}
          onChangeText={setText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          multiline
          maxLength={2000}
        />
        
        {text.trim() ? (
          <TouchableOpacity 
            onPress={handleSend} 
            style={styles.sendButton}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryMuted]}
              style={styles.sendButtonGradient}
            >
              <Ionicons name="arrow-up" size={20} color={colors.textInverse} />
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <Animated.View style={{ transform: [{ scale: micScale }] }}>
            <TouchableOpacity
              onPress={handleMicPress}
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
              style={styles.micButton}
              activeOpacity={1}
            >
              <Ionicons name="mic" size={22} color={colors.primary} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  inputContainerFocused: {
    borderColor: colors.borderFocused,
  },
  input: {
    flex: 1,
    fontSize: typography.base,
    color: colors.textPrimary,
    maxHeight: 100,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginLeft: spacing.sm,
  },
  sendButtonGradient: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.error,
  },
  cancelButton: {
    padding: spacing.sm,
  },
  cancelText: {
    color: colors.error,
    fontSize: typography.base,
    fontWeight: typography.medium,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.error,
  },
  recordingTime: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: typography.medium,
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  stopButtonGradient: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
