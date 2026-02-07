# API Reference

> Gateway Protocol & External Services

**Last Updated:** February 7, 2026

---

## OpenClaw Gateway API

The app communicates with Echo via the OpenClaw Gateway's OpenAI-compatible HTTP API.

### Base URL

```
Production: https://echo.oppersmedical.com
Development: http://localhost:18789
```

### Authentication

All requests require a Bearer token:

```http
Authorization: Bearer <gateway-token>
```

The token is configured in Settings and stored securely in the app.

---

## Endpoints

### Send Message

Send a message and receive Echo's response.

```http
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "model": "openclaw:main",
  "messages": [
    { "role": "user", "content": "What's my schedule today?" }
  ],
  "stream": false,
  "user": "echo-app-user"
}
```

**Response:**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1707307200,
  "model": "openclaw:main",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Good morning! You have 3 meetings today..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 42,
    "completion_tokens": 128,
    "total_tokens": 170
  }
}
```

### Health Check

Verify gateway connectivity.

```http
GET /ping
```

**Response:** `200 OK` with body `pong` or similar.

---

## Message History

The app maintains conversation history locally and sends it with each request:

```typescript
const messages = [
  // Previous messages for context
  { role: "user", content: "What meetings do I have?" },
  { role: "assistant", content: "You have a standup at 9am..." },
  // Current message
  { role: "user", content: "Cancel the standup" }
];
```

**Note:** History is limited to last N messages to stay within token limits.

---

## External Services

### ElevenLabs (Text-to-Speech)

Converts Echo's text responses to speech.

**Endpoint:** `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`

**Voices Used:**
- `river` (default) — Warm, conversational

**Request:**

```json
{
  "text": "Good morning, Oliver!",
  "model_id": "eleven_turbo_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75
  }
}
```

**Response:** Audio stream (MP3)

### OpenAI Whisper (Speech-to-Text)

Transcribes voice recordings to text.

**Endpoint:** `https://api.openai.com/v1/audio/transcriptions`

**Request:**

```http
POST /v1/audio/transcriptions
Content-Type: multipart/form-data

file: <audio.m4a>
model: whisper-1
```

**Response:**

```json
{
  "text": "What's my schedule for today?"
}
```

### Google Calendar (via `gog` CLI)

Calendar integration is handled server-side by Echo via the `gog` skill.
The app receives calendar data as part of chat responses.

---

## Error Handling

### Gateway Errors

| Status | Meaning | App Behavior |
|--------|---------|--------------|
| 401 | Invalid token | Prompt to check Settings |
| 502/503 | Gateway down | Show offline, enable retry |
| 408 | Timeout | Show timeout message |

### Network Errors

```typescript
try {
  const response = await gatewaySend(content);
} catch (error) {
  if (error.message.includes('Network')) {
    setConnected(false);
    // Show offline indicator
  }
}
```

---

## Rate Limits

No explicit rate limits enforced, but the Gateway may apply model-level limits:

- Claude API: ~60 requests/minute
- ElevenLabs: Character-based monthly quota
- Whisper: ~50 requests/minute

---

## WebSocket (Future)

A WebSocket connection is planned for:
- Real-time streaming responses
- Push notifications when app is foregrounded
- Typing indicators

**Planned Protocol:**

```typescript
interface WSMessage {
  type: 'message' | 'typing' | 'status' | 'done';
  id?: string;
  content?: string;
  state?: 'idle' | 'thinking' | 'speaking';
}
```

---

## Type Definitions

```typescript
// Gateway message format
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Gateway response
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
```
