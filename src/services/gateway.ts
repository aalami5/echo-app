/**
 * OpenClaw Gateway API Service
 * 
 * Connects to the Gateway's HTTP APIs for sending messages.
 * 
 * Build 24: Use OpenResponses API for images
 *           - OpenAI Chat Completions API doesn't support images
 *           - OpenResponses API properly handles input_image items
 */

import { AppState } from 'react-native';
import { getCachedDevicePushToken } from './notifications';

// Request timeout in milliseconds (3 minutes - allows long responses)
const REQUEST_TIMEOUT_MS = 180000;

interface GatewayConfig {
  baseUrl: string;
  token: string;
  agentId?: string;
  userId?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// OpenResponses API types
interface OpenResponsesContentPart {
  type: 'input_text' | 'input_image' | 'input_file';
  text?: string;
  source?: {
    type: 'base64' | 'url';
    media_type?: string;
    data?: string;
    url?: string;
  };
}

interface OpenResponsesInputItem {
  type: 'message' | 'input_image' | 'input_file';
  role?: string;
  content?: string | OpenResponsesContentPart[];
  source?: {
    type: 'base64' | 'url';
    media_type?: string;
    data?: string;
    url?: string;
  };
}

interface OpenResponsesResponse {
  id: string;
  object: string;
  created_at: number;
  model: string;
  output: Array<{
    type: string;
    id?: string;
    role?: string;
    content?: Array<{
      type: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

/**
 * Create a fetch request with timeout using AbortController
 * Pass timeoutMs = 0 to disable timeout (no abort).
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  // No timeout — just fetch directly
  if (timeoutMs <= 0) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export class GatewayService {
  private config: GatewayConfig;

  constructor(config: GatewayConfig) {
    this.config = {
      agentId: 'main',
      userId: 'echo-app-user',
      ...config,
    };
  }

  /**
   * Send a message to the Gateway and get a response
   * 
   * Uses OpenResponses API when images are included (for proper image support),
   * falls back to OpenAI Chat Completions API for text-only messages.
   * 
   * @param content - Text content to send
   * @param history - Previous messages for context
   * @param imageBase64 - Optional base64-encoded image (without data: prefix)
   * @param imageMimeType - MIME type of the image (e.g., 'image/jpeg')
   */
  async sendMessage(
    content: string,
    history: ChatMessage[] = [],
    imageBase64?: string,
    imageMimeType?: string,
    noTimeout?: boolean
  ): Promise<string> {
    const { baseUrl: rawUrl, token, agentId, userId } = this.config;
    const baseUrl = rawUrl.trim().replace(/\/+$/, ''); // Normalize URL
    const devicePushToken = await getCachedDevicePushToken();
    const appState = AppState.currentState;
    const timeoutMs = noTimeout ? 0 : REQUEST_TIMEOUT_MS;
    
    console.log('[Gateway] Sending message:', content.slice(0, 100), noTimeout ? '(no timeout)' : '');
    console.log('[Gateway] Has image:', !!imageBase64, 'type:', imageMimeType || 'none');
    
    // Validate config before sending
    if (!baseUrl) {
      throw new Error('Gateway URL not configured');
    }
    if (!token) {
      throw new Error('Gateway token not configured');
    }

    // Use OpenResponses API for images (it properly supports them)
    if (imageBase64 && imageMimeType) {
      return this.sendMessageWithImage(baseUrl, token, agentId!, userId!, content, imageBase64, imageMimeType, devicePushToken, appState, timeoutMs);
    }
    
    // Use OpenAI Chat Completions API for text-only (simpler response format)
    return this.sendMessageTextOnly(baseUrl, token, agentId!, userId!, content, history, devicePushToken, appState, timeoutMs);
  }

  /**
   * Send message with image using OpenResponses API
   */
  private async sendMessageWithImage(
    baseUrl: string,
    token: string,
    agentId: string,
    userId: string,
    content: string,
    imageBase64: string,
    imageMimeType: string,
    devicePushToken: string | null,
    appState: string | null,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<string> {
    console.log('[Gateway] Using OpenResponses API for image');
    console.log('[Gateway] URL:', `${baseUrl}/v1/responses`);

    // Build input: image goes INSIDE the message content array (not top-level)
    const input: OpenResponsesInputItem[] = [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: content,
          },
          {
            type: 'input_image',
            source: {
              type: 'base64',
              media_type: imageMimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ];

    const response = await fetchWithTimeout(
      `${baseUrl}/v1/responses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'x-openclaw-agent-id': agentId,
          'X-App-State': appState || 'unknown',
          ...(devicePushToken ? { 'X-APNS-Token': devicePushToken } : {}),
        },
        body: JSON.stringify({
          model: `openclaw:${agentId}`,
          input,
          stream: false,
          user: userId,
        }),
      },
      timeoutMs
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gateway] OpenResponses API error:', response.status, errorText);
      
      if (response.status === 401) {
        throw new Error('Invalid gateway token. Please check your settings.');
      } else if (response.status === 403) {
        throw new Error('Access denied. Token may be expired.');
      } else if (response.status === 400) {
        // Parse error for more details
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error?.message || `Bad request: ${errorText}`);
        } catch {
          throw new Error(`Bad request: ${errorText}`);
        }
      } else if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new Error('Gateway temporarily unavailable. Please try again.');
      } else {
        throw new Error(`Gateway error: ${response.status}`);
      }
    }

    const result: OpenResponsesResponse = await response.json();
    console.log('[Gateway] OpenResponses result:', JSON.stringify(result).slice(0, 300));
    
    // Extract text from the response output
    const textContent = result.output
      ?.filter(item => item.type === 'message' && item.role === 'assistant')
      ?.flatMap(item => item.content || [])
      ?.filter(c => c.type === 'text' || c.type === 'output_text')
      ?.map(c => c.text || '')
      ?.join('');
    
    if (!textContent) {
      // Try alternative response format
      const altText = result.output
        ?.filter(item => item.type === 'text')
        ?.map(item => (item as any).text || '')
        ?.join('');
      
      if (altText) {
        return altText;
      }
      
      console.error('[Gateway] No text in response:', JSON.stringify(result));
      throw new Error('No response from Gateway');
    }

    console.log('[Gateway] Response text:', textContent.slice(0, 200));
    return textContent;
  }

  /**
   * Send text-only message using OpenAI Chat Completions API
   */
  private async sendMessageTextOnly(
    baseUrl: string,
    token: string,
    agentId: string,
    userId: string,
    content: string,
    history: ChatMessage[],
    devicePushToken: string | null,
    appState: string | null,
    timeoutMs: number = REQUEST_TIMEOUT_MS
  ): Promise<string> {
    console.log('[Gateway] Using Chat Completions API (text-only)');
    console.log('[Gateway] URL:', `${baseUrl}/v1/chat/completions`);
    
    const messages: ChatMessage[] = [
      ...history,
      { role: 'user', content }
    ];

    const response = await fetchWithTimeout(
      `${baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          'X-App-State': appState || 'unknown',
          ...(devicePushToken ? { 'X-APNS-Token': devicePushToken } : {}),
        },
        body: JSON.stringify({
          model: `openclaw:${agentId}`,
          messages,
          stream: false,
          user: userId,
        }),
      },
      timeoutMs
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gateway] Chat Completions API error:', response.status, errorText);
      
      if (response.status === 401) {
        throw new Error('Invalid gateway token. Please check your settings.');
      } else if (response.status === 403) {
        throw new Error('Access denied. Token may be expired.');
      } else if (response.status === 502 || response.status === 503 || response.status === 504) {
        throw new Error('Gateway temporarily unavailable. Please try again.');
      } else {
        throw new Error(`Gateway error: ${response.status}`);
      }
    }

    const result: ChatCompletionResponse = await response.json();
    console.log('[Gateway] Chat Completions result:', JSON.stringify(result).slice(0, 200));
    
    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from Gateway');
    }

    const responseText = result.choices[0].message.content;
    console.log('[Gateway] Response text:', responseText.slice(0, 200));
    return responseText;
  }

  /**
   * Check if the Gateway is reachable and token is valid
   */
  async healthCheck(): Promise<boolean> {
    // Trim URL and remove any trailing slashes
    const url = this.config.baseUrl.trim().replace(/\/+$/, '');
    const token = this.config.token;
    
    console.log('[Gateway] Health check starting');
    console.log('[Gateway] Base URL:', JSON.stringify(url));
    console.log('[Gateway] Token present:', !!token, 'length:', token?.length || 0);
    
    // Basic validation
    if (!url || !token) {
      console.error('[Gateway] Health check failed: missing URL or token');
      return false;
    }
    
    try {
      // Use simple fetch GET to /ping endpoint (avoids CORS preflight)
      const pingUrl = url + '/ping';
      console.log('[Gateway] Pinging:', JSON.stringify(pingUrl));
      
      // Use shorter timeout for health checks (10 seconds)
      const response = await fetchWithTimeout(
        pingUrl,
        {
          method: 'GET',
          headers: {
            'Accept': '*/*',
          },
        },
        10000
      );
      
      console.log('[Gateway] Ping response status:', response.status);
      
      if (response.ok) {
        return true;
      }
      
      // If /ping doesn't exist, try the base URL
      console.log('[Gateway] Trying base URL...');
      const baseResponse = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/json',
          },
        },
        10000
      );
      
      console.log('[Gateway] Base URL response status:', baseResponse.status);
      return baseResponse.ok;
    } catch (error: any) {
      // Log detailed error info
      console.error('[Gateway] Health check failed');
      console.error('[Gateway] Error name:', error?.name || 'unknown');
      console.error('[Gateway] Error message:', error?.message || String(error));
      if (error?.code) {
        console.error('[Gateway] Error code:', error.code);
      }
      console.error('[Gateway] Base URL was:', url);
      return false;
    }
  }

  /**
   * Update configuration (e.g., when settings change)
   */
  updateConfig(config: Partial<GatewayConfig>) {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a Gateway service instance
 */
export function createGatewayService(baseUrl: string, token: string): GatewayService {
  return new GatewayService({ baseUrl, token });
}
