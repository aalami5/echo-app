# API Reference

> Gateway Protocol & External Services

**Last Updated:** August 7, 2026

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
x-openclaw-scopes: operator.write
```

> **Note:** As of OpenClaw 2026.3.28, the `x-openclaw-scopes: operator.write` header is required. Without it, requests return 403 `missing scope: operator.write`.

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

### Finalized Dictation Sync

Upload the current finalized operative-report set to the sync server. The payload is a snapshot of all finalized reports currently known to the app, not a per-report delta.

```http
POST /patients/dictations/sync
Content-Type: application/json
Authorization: Bearer <gateway-token>
```

**Request Body:**

```json
{
  "dictations": {
    "uuid-1": {
      "id": "uuid-1",
      "patientId": "patient-123",
      "status": "final",
      "dateOfOperation": "2026-04-18T00:00:00.000Z",
      "selectedProcedures": ["Right carotid endarterectomy"],
      "generatedReport": "This is Dr. Aalami...",
      "transcriptParts": [
        {
          "id": "part-1",
          "type": "text",
          "content": "Patient had symptomatic carotid stenosis",
          "timestamp": "2026-04-18T18:10:00.000Z"
        }
      ],
      "createdAt": "2026-04-18T18:00:00.000Z",
      "updatedAt": "2026-04-18T18:12:00.000Z"
    }
  }
}
```

**Response:**

```json
{
  "success": true,
  "dictationCount": 1,
  "lastSync": "2026-04-18T18:12:30.000Z"
}
```

### Finalized Dictation Retrieval

```http
GET /patients/dictations/list
Authorization: Bearer <gateway-token>
```

Returns:

```json
{
  "dictations": {
    "uuid-1": { "...": "dictation payload" }
  },
  "lastSync": "2026-04-18T18:12:30.000Z"
}
```

```http
GET /patients/dictations/:id
Authorization: Bearer <gateway-token>
```

Returns one finalized dictation or `404` if not found.

The sync server also exposes root-level mirrors for local/direct use:

```http
POST /dictations/sync
GET /dictations/list
GET /dictations/:id
```

---

### Operative Report Email

Send generated operative report text through the sync server's configured Gmail account.

```http
POST /patients/dictations/email
Content-Type: application/json
Authorization: Bearer <gateway-token>
```

**Request Body:**

```json
{
  "report": "This is Dr. Aalami with a dictated operative report...",
  "subject": "Operative Report - July 16, 2026"
}
```

`subject` is optional. If omitted, the server generates a date-based operative-report subject.

**Response:**

```json
{
  "success": true,
  "recipients": [
    "aalami@gmail.com",
    "Oliver.Aalami@sutterhealth.org",
    "Rajka.Campbell@sutterhealth.org"
  ],
  "subject": "Operative Report - July 16, 2026",
  "messageId": "gmail-message-id",
  "sentAt": "2026-07-16T19:00:00.000Z"
}
```

The sync server also exposes a root-level mirror for local/direct use:

```http
POST /dictations/email
```

---

## Message Sync Queue

Push-backed messages and briefs are queued server-side so the app can recover them after missed/delayed APNs delivery.

```http
GET /patients/messages/pending
Authorization: Bearer <gateway-token>
```

Returns pending queued messages from `pending-messages.json`.

```http
POST /patients/messages/ack
Content-Type: application/json
Authorization: Bearer <gateway-token>
```

```json
{ "messageIds": ["msg-123"] }
```

Acknowledges synced messages, removes them from the pending queue, and records an `acked` receipt event in `notification-deliveries.json`.

Queued messages can include an optional `card` object. Build 67 defines `meeting_reply` cards with `replyText`, `suggestions`, `conflictSummary`, `durationMinutes`, `windowLabel`, and `timeZone` fields under `card.data`.

---

## Meeting Reply Cards

Generate a conflict-checked scheduling reply and queue it as a rich chat card.

```http
POST /notify/meeting-reply
Content-Type: application/json
Authorization: Bearer <gateway-token>
```

**Request Body:**

```json
{
  "requester": "Jane",
  "subject": "Biodesign sync",
  "windowStart": "2026-05-21T15:00:00.000Z",
  "windowEnd": "2026-05-28T00:00:00.000Z",
  "durationMinutes": 30,
  "maxSuggestions": 3,
  "location": "Zoom",
  "sendPush": true
}
```

**Response:**

```json
{
  "success": true,
  "messageId": "meeting-reply-...",
  "card": {
    "type": "meeting_reply",
    "title": "Meeting reply: Biodesign sync",
    "subtitle": "3 clean options found",
    "body": "Hi Jane...",
    "data": {
      "replyText": "Hi Jane...",
      "suggestions": [
        { "start": "2026-05-21T16:00:00.000Z", "end": "2026-05-21T16:30:00.000Z", "label": "Thu, May 21, 9:00-9:30 AM" }
      ],
      "conflictSummary": ["Thu, May 21, 10:00-11:00 AM: Clinic"],
      "durationMinutes": 30,
      "windowLabel": "Thu, May 21 - Wed, May 27",
      "timeZone": "America/Los_Angeles"
    }
  }
}
```

Defaults: `MEETING_REPLY_ACCOUNT` or `aalami@gmail.com`, `MEETING_REPLY_TIME_ZONE` or `America/Los_Angeles`, 14-day search window, and 8 AM-5 PM workday bounds.

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
| 403 | Access denied or expired token | Show access-denied token guidance |
| 502/503/504 | Gateway temporarily unavailable | Show retryable gateway message |
| 524 | Cloudflare timeout | Explain that the request may still finish in the background |

Gateway calls parse JSON error bodies when available and reuse the same error-message helper for chat completions, OpenResponses/image requests, and operative-report email sends.

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
