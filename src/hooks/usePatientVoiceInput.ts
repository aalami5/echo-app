/**
 * Patient Voice Input Hook
 * 
 * Voice-to-text for patient encounter logging.
 * Transcribes speech using Whisper and extracts patient info.
 */

import { useState, useCallback } from 'react';
import { useVoiceRecording } from './useVoiceRecording';
import { createWhisperService } from '../services/whisper';
import { useSettingsStore } from '../stores/settingsStore';

interface PatientVoiceInputResult {
  // Recording state
  isRecording: boolean;
  isTranscribing: boolean;
  audioLevel: number;
  duration: number;
  error: string | null;
  
  // Actions
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  cancelRecording: () => Promise<void>;
}

export function usePatientVoiceInput(): PatientVoiceInputResult {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const openaiApiKey = useSettingsStore((s) => s.openaiApiKey);
  
  const {
    isRecording,
    audioLevel,
    duration,
    startRecording: startRec,
    stopRecording: stopRec,
    cancelRecording: cancelRec,
  } = useVoiceRecording();
  
  const startRecording = useCallback(async () => {
    setError(null);
    
    if (!openaiApiKey) {
      setError('OpenAI API key required for voice input. Add it in Settings.');
      return;
    }
    
    await startRec();
  }, [openaiApiKey, startRec]);
  
  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    const audioUri = await stopRec();
    
    if (!audioUri) {
      setError('No audio recorded');
      return null;
    }
    
    if (!openaiApiKey) {
      setError('OpenAI API key required');
      return null;
    }
    
    setIsTranscribing(true);
    setError(null);
    
    try {
      const whisper = createWhisperService(openaiApiKey);
      const result = await whisper.transcribe(audioUri);
      
      return result.text || null;
    } catch (e: any) {
      console.error('[PatientVoice] Transcription error:', e);
      setError(e.message || 'Transcription failed');
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [openaiApiKey, stopRec]);
  
  const cancelRecording = useCallback(async () => {
    setError(null);
    await cancelRec();
  }, [cancelRec]);
  
  return {
    isRecording,
    isTranscribing,
    audioLevel,
    duration,
    error,
    startRecording,
    stopAndTranscribe,
    cancelRecording,
  };
}
