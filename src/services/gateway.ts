/**
 * OpenClaw Gateway API Service
 * 
 * Connects to the Gateway's OpenAI-compatible HTTP API
 * for sending messages and receiving responses.
 */

import axios from 'axios';
import { AppState } from 'react-native';
import { getCachedDevicePushToken } from './notifications';

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
   */
  async sendMessage(content: string, history: ChatMessage[] = []): Promise<string> {
    const { baseUrl: rawUrl, token, agentId, userId } = this.config;
    const baseUrl = rawUrl.trim();
    const devicePushToken = await getCachedDevicePushToken();
    const appState = AppState.currentState;
    
    console.log('[Gateway] Sending message:', content);
    console.log('[Gateway] URL:', `${baseUrl}/v1/chat/completions`);
    
    const messages: ChatMessage[] = [
      ...history,
      { role: 'user', content }
    ];

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
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
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Gateway] API error:', response.status, error);
      throw new Error(`Gateway error: ${response.status}`);
    }

    const result: ChatCompletionResponse = await response.json();
    console.log('[Gateway] Response received:', JSON.stringify(result).slice(0, 200));
    
    if (!result.choices || result.choices.length === 0) {
      throw new Error('No response from Gateway');
    }

    const responseText = result.choices[0].message.content;
    console.log('[Gateway] Assistant response:', responseText);
    return responseText;
  }

  /**
   * Check if the Gateway is reachable
   */
  async healthCheck(): Promise<boolean> {
    // Trim URL and remove any trailing slashes
    const url = this.config.baseUrl.trim().replace(/\/+$/, '');
    console.log('[Gateway] Health check starting');
    console.log('[Gateway] Base URL:', JSON.stringify(url));
    console.log('[Gateway] Token length:', this.config.token?.length || 0);
    
    try {
      // Use simple fetch GET to /ping endpoint (avoids CORS preflight)
      const pingUrl = url + '/ping';
      console.log('[Gateway] Pinging:', JSON.stringify(pingUrl));
      
      const response = await fetch(pingUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain',
        },
      });
      
      console.log('[Gateway] Ping response status:', response.status);
      
      if (response.ok) {
        return true;
      }
      
      // If /ping doesn't exist, try the base URL
      console.log('[Gateway] Trying base URL...');
      const baseResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/json',
        },
      });
      
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
