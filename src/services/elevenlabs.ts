/**
 * ElevenLabs Text-to-Speech Service
 * 
 * Converts text responses to natural-sounding speech.
 * Default voice: River (relaxed, neutral, informative)
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

// Voice IDs from ElevenLabs
export const VOICES = {
  river: 'SAz9YHcvj6GT2YYXdXww',     // Relaxed, Neutral, Informative - DEFAULT
  eric: 'cjVigY5qzO86Huf0OWal',       // Smooth, Trustworthy
  alice: 'Xb7hH8MSUJpSbSDYk0k2',      // Clear, Engaging Educator
  matilda: 'XrExE9yKIg1WjnnlVkGX',    // Knowledgeable, Professional
  jessica: 'cgSgspJ2msm6clMCkdW9',    // Playful, Bright, Warm
} as const;

export type VoiceName = keyof typeof VOICES;

interface TTSConfig {
  apiKey: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;      // 0-1, lower = more expressive
  similarityBoost?: number; // 0-1, higher = closer to original voice
  style?: number;          // 0-1, style exaggeration
}

interface SpeakOptions {
  text: string;
  voiceId?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

/**
 * ElevenLabs TTS Service
 */
export class ElevenLabsService {
  private apiKey: string;
  private voiceId: string;
  private modelId: string;
  private stability: number;
  private similarityBoost: number;
  private currentSound: Audio.Sound | null = null;

  constructor(config: TTSConfig) {
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId || VOICES.river;
    this.modelId = config.modelId || 'eleven_multilingual_v2';
    this.stability = config.stability ?? 0.5;
    this.similarityBoost = config.similarityBoost ?? 0.75;
  }

  /**
   * Convert text to speech and play immediately
   */
  async speak(options: SpeakOptions): Promise<void> {
    const { text, voiceId, onStart, onEnd, onError } = options;

    if (!text?.trim()) {
      console.log('[ElevenLabs] No text to speak');
      return;
    }

    // Stop any currently playing audio
    await this.stop();

    const targetVoiceId = voiceId || this.voiceId;
    const url = `${ELEVENLABS_API_URL}/${targetVoiceId}`;

    try {
      console.log('[ElevenLabs] Generating speech...');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: this.stability,
            similarity_boost: this.similarityBoost,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[ElevenLabs] API error:', error);
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      // Get audio data as blob
      const audioBlob = await response.blob();
      
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove data URL prefix
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const base64Data = await base64Promise;

      // Save to temporary file
      const fileUri = `${FileSystem.cacheDirectory}echo_response_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Configure audio mode for playback
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Track if we've already fired onStart (to avoid duplicates)
      let hasStarted = false;

      // Create and play sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            // Fire onStart when audio actually starts playing
            if (status.isPlaying && !hasStarted) {
              hasStarted = true;
              console.log('[ElevenLabs] Audio playback started');
              onStart?.();
            }
            // Fire onEnd when playback finishes
            if (status.didJustFinish) {
              console.log('[ElevenLabs] Playback finished');
              onEnd?.();
              this.cleanup(fileUri);
            }
          }
        }
      );

      this.currentSound = sound;
      console.log('[ElevenLabs] Audio loaded, waiting for playback...');

    } catch (error) {
      console.error('[ElevenLabs] Error:', error);
      onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Stop currently playing audio
   */
  async stop(): Promise<void> {
    if (this.currentSound) {
      try {
        await this.currentSound.stopAsync();
        await this.currentSound.unloadAsync();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.currentSound = null;
    }
  }

  /**
   * Set the default voice
   */
  setVoice(voiceName: VoiceName): void {
    this.voiceId = VOICES[voiceName];
    console.log(`[ElevenLabs] Voice set to: ${voiceName}`);
  }

  /**
   * Get available voices
   */
  getAvailableVoices(): Record<string, string> {
    return { ...VOICES };
  }

  /**
   * Clean up temporary files
   */
  private async cleanup(fileUri: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create an ElevenLabs service instance
 */
export function createElevenLabsService(apiKey: string, voiceName: VoiceName = 'river') {
  return new ElevenLabsService({
    apiKey,
    voiceId: VOICES[voiceName],
  });
}
