/**
 * OpenClaw Gateway API Service
 * 
 * Connects to the Gateway's OpenAI-compatible HTTP API
 * for sending messages and receiving responses.
 */

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
    const { baseUrl, token, agentId, userId } = this.config;
    
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
    const url = this.config.baseUrl;
    console.log('[Gateway] Health check starting, URL:', url);
    
    try {
      // Use a simple HEAD request or try the API endpoint
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({
          model: 'openclaw:main',
          messages: [{ role: 'user', content: 'ping' }],
          stream: false,
        }),
      });
      
      console.log('[Gateway] Health check response status:', response.status);
      // Accept any response as "connected" - even errors mean we reached the server
      return response.status < 500;
    } catch (error) {
      console.error('[Gateway] Health check failed:', error);
      // Log more details about the URL being used
      console.error('[Gateway] URL was:', url);
      console.error('[Gateway] Token present:', !!this.config.token);
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
