/**
 * Patient Voice Input Hook
 * 
 * Voice-to-text for patient encounter logging.
 * Transcribes speech using Whisper and extracts patient info.
 */

import { useState, useCallback } from 'react';
import { useVoiceRecording } from './useVoiceRecording';
import { createWhisperService } from '../services/whisper';


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
    
    
    await startRec();
  }, [startRec]);
  
  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    const audioUri = await stopRec();
    
    if (!audioUri) {
      setError('No audio recorded');
      return null;
    }
    
    
    setIsTranscribing(true);
    setError(null);
    
    try {
      const whisper = createWhisperService();
      const result = await whisper.transcribe(audioUri);
      
      if (!result.text?.trim()) {
        setError('No speech was detected. Please try recording again.');
        return null;
      }
      return result.text;
    } catch (e: any) {
      console.error('[PatientVoice] Transcription error:', e);
      setError(e.message || 'Transcription failed');
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, [stopRec]);
  
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
