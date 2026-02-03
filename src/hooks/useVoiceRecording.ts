import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

interface UseVoiceRecordingResult {
  isRecording: boolean;
  duration: number;
  audioLevel: number; // 0-1 for audio reactivity
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => Promise<void>;
}

export function useVoiceRecording(): UseVoiceRecordingResult {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const recording = useRef<Audio.Recording | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const meteringInterval = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    // Prevent double-starts
    if (isRecording) {
      console.log('Already recording, ignoring start request');
      return;
    }

    try {
      // Clean up any existing recording first
      if (recording.current) {
        try {
          await recording.current.stopAndUnloadAsync();
        } catch (e) {
          // Ignore cleanup errors
        }
        recording.current = null;
      }

      // Clear any existing intervals
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
      if (meteringInterval.current) {
        clearInterval(meteringInterval.current);
        meteringInterval.current = null;
      }

      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Audio permission not granted');
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Start recording with metering enabled
      const { recording: newRecording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        }
      );
      
      recording.current = newRecording;
      setIsRecording(true);
      setDuration(0);
      setAudioLevel(0);

      // Track duration
      durationInterval.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      // Track audio levels for reactive animations
      meteringInterval.current = setInterval(async () => {
        if (recording.current) {
          try {
            const status = await recording.current.getStatusAsync();
            if (status.isRecording && status.metering !== undefined) {
              // Convert dB to 0-1 scale
              // Metering is typically -160 to 0 dB
              // -60 to 0 is the usable range for voice
              const db = status.metering;
              const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
              setAudioLevel(normalized);
            }
          } catch (e) {
            // Ignore metering errors
          }
        }
      }, 100); // Update 10 times per second for smooth animation

    } catch (error) {
      console.log('Failed to start recording:', error);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    // Stop tracking first
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
    if (meteringInterval.current) {
      clearInterval(meteringInterval.current);
      meteringInterval.current = null;
    }

    // Update state immediately
    setIsRecording(false);
    setDuration(0);
    setAudioLevel(0);

    try {
      if (!recording.current) return null;

      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Stop and get URI
      await recording.current.stopAndUnloadAsync();
      const uri = recording.current.getURI();
      
      recording.current = null;

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      return uri;
    } catch (error) {
      console.log('Failed to stop recording:', error);
      recording.current = null;
      return null;
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    try {
      if (!recording.current) return;

      // Stop tracking
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
      if (meteringInterval.current) {
        clearInterval(meteringInterval.current);
        meteringInterval.current = null;
      }

      // Haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      // Stop without saving
      await recording.current.stopAndUnloadAsync();
      recording.current = null;
      setIsRecording(false);
      setDuration(0);
      setAudioLevel(0);

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    } catch (error) {
      console.log('Failed to cancel recording:', error);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationInterval.current) clearInterval(durationInterval.current);
      if (meteringInterval.current) clearInterval(meteringInterval.current);
    };
  }, []);

  return {
    isRecording,
    duration,
    audioLevel,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
