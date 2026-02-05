/**
 * OpenAI Whisper Speech-to-Text Service
 * 
 * Transcribes audio recordings using OpenAI's Whisper API.
 * Cost: ~$0.006 per minute of audio
 */

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

interface WhisperConfig {
  apiKey: string;
  model?: 'whisper-1';
  language?: string; // ISO-639-1 code, e.g., 'en'
  prompt?: string; // Optional context to improve accuracy
}

/**
 * Transcribe an audio file using OpenAI Whisper
 * 
 * @param audioUri - Local file URI from expo-av recording
 * @param config - Whisper API configuration
 * @returns Transcription result with text
 */
export async function transcribeAudio(
  audioUri: string,
  config: WhisperConfig
): Promise<TranscriptionResult> {
  const { apiKey, model = 'whisper-1', language, prompt } = config;

  if (!apiKey) {
    throw new Error('OpenAI API key is required for Whisper transcription');
  }

  // Create form data for the API request
  const formData = new FormData();
  
  // Append the audio file
  // expo-av records in m4a format by default on iOS
  const filename = audioUri.split('/').pop() || 'audio.m4a';
  const fileExtension = filename.split('.').pop()?.toLowerCase() || 'm4a';
  
  // Map extension to MIME type
  const mimeTypes: Record<string, string> = {
    'm4a': 'audio/m4a',
    'mp3': 'audio/mpeg',
    'mp4': 'audio/mp4',
    'wav': 'audio/wav',
    'webm': 'audio/webm',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
  };
  
  const mimeType = mimeTypes[fileExtension] || 'audio/m4a';

  formData.append('file', {
    uri: audioUri,
    type: mimeType,
    name: filename,
  } as any);

  formData.append('model', model);
  
  if (language) {
    formData.append('language', language);
  }
  
  if (prompt) {
    formData.append('prompt', prompt);
  }

  // Make the API request
  const response = await fetch(WHISPER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[Whisper] API error:', error);
    throw new Error(`Whisper API error: ${response.status}`);
  }

  const result = await response.json();
  
  return {
    text: result.text?.trim() || '',
    language: result.language,
    duration: result.duration,
  };
}

/**
 * Create a Whisper transcription service with stored config
 */
export function createWhisperService(apiKey: string) {
  const config: WhisperConfig = {
    apiKey,
    model: 'whisper-1',
    // Add medical context to improve accuracy for healthcare terms
    prompt: 'Medical consultation, healthcare, clinical terms, patient care.',
  };

  return {
    transcribe: (audioUri: string) => transcribeAudio(audioUri, config),
    
    transcribeWithLanguage: (audioUri: string, language: string) => 
      transcribeAudio(audioUri, { ...config, language }),
  };
}
