/**
 * Voice Chat Hook
 * 
 * Combines voice recording, Whisper transcription, and ElevenLabs TTS
 * for a complete voice conversation experience with Echo.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { createWhisperService } from '../services/whisper';
import { createElevenLabsService, ElevenLabsService, VoiceName } from '../services/elevenlabs';
import { useSettingsStore } from '../stores/settingsStore';

interface VoiceChatState {
  // Recording state
  isRecording: boolean;
  recordingDuration: number;
  audioLevel: number;
  
  // Processing state
  isTranscribing: boolean;
  isLoadingAudio: boolean;  // True while fetching TTS audio
  isSpeaking: boolean;      // True only when audio is actually playing
  
  // Error state
  error: string | null;
}

interface UseVoiceChatResult extends VoiceChatState {
  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>; // Returns transcribed text
  cancelRecording: () => Promise<void>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => Promise<void>;
  
  // Configuration
  setVoice: (voice: VoiceName) => void;
  isConfigured: boolean;
}

export function useVoiceChat(): UseVoiceChatResult {
  // State
  const [state, setState] = useState<VoiceChatState>({
    isRecording: false,
    recordingDuration: 0,
    audioLevel: 0,
    isTranscribing: false,
    isLoadingAudio: false,
    isSpeaking: false,
    error: null,
  });

  // Refs
  const recording = useRef<Audio.Recording | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const meteringInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ttsService = useRef<ElevenLabsService | null>(null);
  const durationRef = useRef<number>(0);

  // Get API keys from settings
  const { openaiApiKey, elevenlabsApiKey, voiceName } = useSettingsStore();

  // Check if services are configured
  const isConfigured = Boolean(openaiApiKey && elevenlabsApiKey);

  // Initialize TTS service when API key changes
  useEffect(() => {
    if (elevenlabsApiKey) {
      ttsService.current = createElevenLabsService(elevenlabsApiKey, voiceName || 'river');
    }
  }, [elevenlabsApiKey, voiceName]);

  /**
   * Start voice recording
   */
  const startRecording = useCallback(async () => {
    if (state.isRecording) {
      console.log('[VoiceChat] Already recording');
      return;
    }

    try {
      // Clean up any existing recording
      if (recording.current) {
        try {
          await recording.current.stopAndUnloadAsync();
        } catch (e) {
          // Ignore
        }
        recording.current = null;
      }

      // Clear intervals
      if (durationInterval.current) clearInterval(durationInterval.current);
      if (meteringInterval.current) clearInterval(meteringInterval.current);

      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setState(s => ({ ...s, error: 'Microphone permission required' }));
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Start recording with metering
      const { recording: newRecording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        }
      );

      recording.current = newRecording;
      setState(s => ({
        ...s,
        isRecording: true,
        recordingDuration: 0,
        audioLevel: 0,
        error: null,
      }));

      // Track duration
      durationRef.current = 0;
      durationInterval.current = setInterval(() => {
        durationRef.current += 1;
        setState(s => ({ ...s, recordingDuration: s.recordingDuration + 1 }));
      }, 1000);

      // Track audio levels
      meteringInterval.current = setInterval(async () => {
        if (recording.current) {
          try {
            const status = await recording.current.getStatusAsync();
            if (status.isRecording && status.metering !== undefined) {
              const db = status.metering;
              const normalized = Math.max(0, Math.min(1, (db + 60) / 60));
              setState(s => ({ ...s, audioLevel: normalized }));
            }
          } catch (e) {
            // Ignore metering errors
          }
        }
      }, 100);

    } catch (error) {
      console.error('[VoiceChat] Start recording error:', error);
      setState(s => ({ ...s, error: 'Failed to start recording' }));
    }
  }, [state.isRecording]);

  /**
   * Stop recording and transcribe with Whisper
   */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    // Capture duration before clearing
    const finalDuration = durationRef.current;
    
    // Stop intervals
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
    if (meteringInterval.current) {
      clearInterval(meteringInterval.current);
      meteringInterval.current = null;
    }

    setState(s => ({
      ...s,
      isRecording: false,
      recordingDuration: 0,
      audioLevel: 0,
    }));

    if (!recording.current) {
      return null;
    }
    
    // Skip if recording was too short (likely accidental tap)
    if (finalDuration < 1) {
      console.log('[VoiceChat] Recording too short, discarding');
      try {
        await recording.current.stopAndUnloadAsync();
      } catch (e) {
        // Ignore
      }
      recording.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return null;
    }

    try {
      // Haptic feedback
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Stop recording
      await recording.current.stopAndUnloadAsync();
      const uri = recording.current.getURI();
      recording.current = null;

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (!uri) {
        return null;
      }

      // Transcribe with Whisper
      if (!openaiApiKey) {
        setState(s => ({ ...s, error: 'OpenAI API key not configured' }));
        return null;
      }

      setState(s => ({ ...s, isTranscribing: true }));

      const whisper = createWhisperService(openaiApiKey);
      const result = await whisper.transcribe(uri);

      setState(s => ({ ...s, isTranscribing: false }));

      console.log('[VoiceChat] Transcribed:', result.text);
      
      // Filter out Whisper hallucinations (common outputs when no real audio)
      const hallucinations = [
        'thank you',
        'thanks for watching',
        'subscribe',
        'like and subscribe',
        'see you next time',
        'bye',
        'goodbye',
        'you',
        'the end',
        'music',
        'applause',
        'silence',
        '...',
        '',
      ];
      
      const cleanedText = result.text?.trim().toLowerCase() || '';
      
      // Check if it's a hallucination or too short to be meaningful
      if (!cleanedText || 
          cleanedText.length < 2 ||
          hallucinations.some(h => cleanedText === h || cleanedText === h + '.')) {
        console.log('[VoiceChat] Filtered out hallucination/empty:', result.text);
        return null;
      }
      
      return result.text;

    } catch (error) {
      console.error('[VoiceChat] Stop/transcribe error:', error);
      setState(s => ({
        ...s,
        isTranscribing: false,
        error: 'Failed to transcribe audio',
      }));
      recording.current = null;
      return null;
    }
  }, [openaiApiKey]);

  /**
   * Cancel recording without processing
   */
  const cancelRecording = useCallback(async () => {
    if (durationInterval.current) clearInterval(durationInterval.current);
    if (meteringInterval.current) clearInterval(meteringInterval.current);

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    if (recording.current) {
      try {
        await recording.current.stopAndUnloadAsync();
      } catch (e) {
        // Ignore
      }
      recording.current = null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });

    setState(s => ({
      ...s,
      isRecording: false,
      recordingDuration: 0,
      audioLevel: 0,
    }));
  }, []);

  /**
   * Speak text using ElevenLabs TTS
   */
  const speak = useCallback(async (text: string) => {
    if (!ttsService.current) {
      console.log('[VoiceChat] TTS not configured');
      setState(s => ({ ...s, error: 'ElevenLabs not configured' }));
      throw new Error('ElevenLabs not configured');
    }

    // Set loading state while we fetch audio from ElevenLabs
    setState(s => ({ ...s, isLoadingAudio: true, error: null }));

    try {
      await ttsService.current.speak({
        text,
        onStart: () => {
          // Audio is now actually playing - switch from loading to speaking
          console.log('[VoiceChat] Audio started, now speaking...');
          setState(s => ({ ...s, isLoadingAudio: false, isSpeaking: true }));
        },
        onEnd: () => {
          console.log('[VoiceChat] Done speaking');
          setState(s => ({ ...s, isSpeaking: false }));
        },
        onError: (error) => {
          console.error('[VoiceChat] TTS error:', error);
          setState(s => ({ ...s, isLoadingAudio: false, isSpeaking: false, error: 'TTS failed' }));
        },
      });
    } catch (error) {
      console.error('[VoiceChat] Speak error:', error);
      setState(s => ({ ...s, isLoadingAudio: false, isSpeaking: false, error: 'Failed to speak' }));
      throw error; // Re-throw so callers can show toast
    }
  }, []);

  /**
   * Stop speaking
   */
  const stopSpeaking = useCallback(async () => {
    if (ttsService.current) {
      await ttsService.current.stop();
    }
    setState(s => ({ ...s, isSpeaking: false }));
  }, []);

  /**
   * Set TTS voice
   */
  const setVoice = useCallback((voice: VoiceName) => {
    if (ttsService.current) {
      ttsService.current.setVoice(voice);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationInterval.current) clearInterval(durationInterval.current);
      if (meteringInterval.current) clearInterval(meteringInterval.current);
      if (ttsService.current) ttsService.current.stop();
    };
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    speak,
    stopSpeaking,
    setVoice,
    isConfigured,
  };
}
