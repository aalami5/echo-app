# Architecture

> Echo App System Design & Technical Overview

**Last Updated:** February 25, 2026

---

## Overview

Echo App is a React Native (Expo) application that provides Oliver with a private interface to interact with Echo, his AI assistant. The app connects to the OpenClaw Gateway via HTTP API for message exchange.

```
┌─────────────────────────────────────────────────────────────────┐
│                         ECHO APP (iOS)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React Native + Expo SDK 52                               │  │
│  │                                                           │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │  │
│  │  │ Chat UI     │ │ Patients    │ │ Settings            │ │  │
│  │  │ (voice+text)│ │ (call list) │ │ (gateway, voice)    │ │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────────┬──────────┘ │  │
│  │         │               │                    │            │  │
│  │  ┌──────▼───────────────▼────────────────────▼──────────┐│  │
│  │  │              Zustand Stores (Persistent)              ││  │
│  │  │  chatStore │ patientsStore │ settingsStore │ networkStore ││
│  │  └──────────────────────┬────────────────────────────────┘│  │
│  │                         │                                 │  │
│  │  ┌──────────────────────▼────────────────────────────────┐│  │
│  │  │              expo-secure-store (Keychain)              ││  │
│  │  │              Encrypted local persistence               ││  │
│  │  └────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              │ HTTPS                            │
│                              ▼                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Cloudflare Tunnel  │
                    │  echo.oppersmedical │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   OpenClaw Gateway  │
                    │   (Mac Mini host)   │
                    │                     │
                    │  /v1/chat/completions
                    │  (OpenAI-compatible) │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │ Claude   │    │ElevenLabs│    │ Whisper  │
        │ (LLM)    │    │ (TTS)    │    │ (STT)    │
        └──────────┘    └──────────┘    └──────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | React Native + Expo SDK 52 | Cross-platform mobile |
| **Language** | TypeScript 5.x | Type safety |
| **State** | Zustand + persist middleware | State management |
| **Storage** | expo-secure-store | Encrypted Keychain storage |
| **Navigation** | Expo Router (file-based) | Tab navigation |
| **Audio** | expo-av | Recording & playback |
| **Haptics** | expo-haptics | Tactile feedback |
| **HTTP** | fetch (native) | Gateway API calls |
| **Push** | expo-notifications | Remote push notifications |
| **Database** | Supabase (Postgres) | Device tokens, notification acks |

---

## Project Structure

```
echo-app/
├── app/                          # Expo Router pages
│   ├── (tabs)/                   # Tab navigation group
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   ├── index.tsx             # Chat screen (main)
│   │   ├── patients.tsx          # Patient tracking
│   │   ├── today.tsx             # Calendar view
│   │   └── explore.tsx           # Settings
│   ├── login.tsx                 # Authentication
│   ├── modal.tsx                 # Modal template
│   └── _layout.tsx               # Root layout
│
├── src/
│   ├── components/               # Reusable UI components
│   │   ├── Avatar.tsx            # Animated Echo avatar
│   │   ├── ChatMessage.tsx       # Message bubbles
│   │   ├── ImagePicker.tsx       # Photo selection modal
│   │   ├── NetworkIndicator.tsx  # Connection quality bars
│   │   ├── NextMeeting.tsx       # Calendar card
│   │   └── ToastContainer.tsx    # Ephemeral notifications
│   │
│   ├── constants/
│   │   └── theme.ts              # Design tokens (colors, spacing)
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useGateway.ts         # Gateway API connection
│   │   ├── useVoiceChat.ts       # Voice recording + TTS
│   │   ├── useCalendar.ts        # Calendar integration
│   │   ├── usePatientVoiceInput.ts  # Voice for patient forms
│   │   ├── usePatientScan.ts     # Image scanning for patients
│   │   └── useNotifications.ts   # Push notification setup
│   │
│   ├── services/                 # External service clients
│   │   ├── gateway.ts            # OpenClaw Gateway API
│   │   ├── elevenlabs.ts         # Text-to-speech
│   │   ├── whisper.ts            # Speech-to-text
│   │   ├── calendar.ts           # Google Calendar
│   │   ├── notifications/        # Push notification service
│   │   │   └── index.ts          # Expo push registration & handling
│   │   └── supabase.ts           # Supabase client for push tokens
│   │
│   ├── stores/                   # Zustand state stores
│   │   ├── authStore.ts          # Authentication state
│   │   ├── chatStore.ts          # Chat messages (persisted)
│   │   ├── patientsStore.ts      # Patient list (persisted)
│   │   ├── settingsStore.ts      # App settings (persisted)
│   │   ├── calendarStore.ts      # Calendar events
│   │   ├── networkStore.ts       # Connection state + toasts
│   │   └── websocketStore.ts     # Legacy connection state
│   │
│   └── types/
│       └── index.ts              # TypeScript type definitions
│
├── assets/                       # Static assets (images, fonts)
├── docs/                         # Documentation (you are here)
├── scripts/                      # Build & utility scripts
│
├── app.json                      # Expo configuration
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── PRD.md                        # Product Requirements Document
└── README.md                     # Quick start guide
```

---

## Data Flow

### Sending a Message

```
1. User taps avatar (voice) or types message
                    │
                    ▼
2. useChatStore.addMessage() - Add to local state
                    │
                    ▼
3. useGateway.sendMessage() - POST to Gateway API
   POST /v1/chat/completions
   {
     model: "openclaw:main",
     messages: [...history, { role: "user", content }],
     stream: false
   }
                    │
                    ▼
4. Gateway processes with Claude, returns response
                    │
                    ▼
5. useChatStore.addMessage() - Add assistant response
                    │
                    ▼
6. If voice enabled: speak(response) via ElevenLabs
                    │
                    ▼
7. Zustand persist middleware → SecureStore
   (Messages persisted to encrypted Keychain)
```

### Voice Input Flow

```
1. User taps avatar to start recording
                    │
                    ▼
2. expo-av starts audio recording
   Avatar state → "listening"
                    │
                    ▼
3. User taps again to stop
                    │
                    ▼
4. Audio sent to Whisper API for transcription
   Avatar state → "thinking"
                    │
                    ▼
5. Transcribed text sent to Gateway
                    │
                    ▼
6. Response received, spoken via ElevenLabs
   Avatar state → "speaking"
                    │
                    ▼
7. Playback complete
   Avatar state → "idle"
```

---

### Image Analysis Flow (Build 26)

```
1. User taps image picker → selects photo
                    │
                    ▼
2. ImagePicker returns base64 + mimeType
                    │
                    ▼
3. useGateway builds OpenAI-compatible multipart content
   Content: [{ type: "image_url", image_url: { url: "data:{mime};base64,..." } }]
                    │
                    ▼
4. GatewayService sends to /v1/chat/completions
   Shows "Analyzing your image..." placeholder
                    │
                    ▼
5. Response received → displayed in chat
   If >30s, push notification sent on completion
```

---

## Persistence Strategy

### What's Persisted (Survives Crashes)

| Store | Storage | Encryption | Contents |
|-------|---------|------------|----------|
| `chatStore` | SecureStore | ✅ Keychain | Last 100 messages |
| `patientsStore` | SecureStore | ✅ Keychain | Patient list, call days |
| `settingsStore` | SecureStore | ✅ Keychain | API keys, preferences |

### What's Ephemeral

| Store | Contents |
|-------|----------|
| `authStore` | Session tokens (future) |
| Connection state | `isConnected`, `avatarState` |

### Persistence Implementation

All persisted stores use the same pattern:

```typescript
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

const secureStorage = {
  getItem: async (name) => SecureStore.getItemAsync(name),
  setItem: async (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: async (name) => SecureStore.deleteItemAsync(name),
};

export const useStore = create(
  persist(
    (set) => ({ /* state and actions */ }),
    {
      name: 'store-key',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ /* what to persist */ }),
    }
  )
);
```

---

## Security Model

### Data Protection

| Data Type | Protection |
|-----------|------------|
| Chat messages | SecureStore (Keychain encryption) |
| Patient PHI | SecureStore (Keychain encryption) |
| API keys | SecureStore (Keychain encryption) |
| Gateway token | SecureStore (Keychain encryption) |

### Network Security

- All traffic over HTTPS via Cloudflare Tunnel
- Gateway URL: `https://echo.oppersmedical.com`
- Bearer token authentication for API calls
- **Baked-in Credentials** (Build 22): Gateway URL and token embedded in build
  - Eliminates need for manual configuration on fresh install
  - Settings still allow override for development

### PHI Considerations

Patient data is stored **locally only** by design:
- Never sent to OpenClaw Gateway
- Never synced to cloud
- Export feature produces local CSV only
- Follows HIPAA data minimization principles

---

## Key Design Decisions

### 1. HTTP API vs WebSocket

**Chose:** HTTP API (OpenAI-compatible `/v1/chat/completions`)

**Why:**
- Simpler to implement and debug
- Works through Cloudflare Tunnel without issues
- Streaming not critical for our use case
- Gateway already exposes this endpoint

### 2. SecureStore vs AsyncStorage

**Chose:** SecureStore (expo-secure-store)

**Why:**
- Hardware-backed encryption on iOS (Keychain)
- Required for storing PHI (patient data)
- Survives app reinstalls (Keychain backup)

### 3. Zustand vs Redux/Context

**Chose:** Zustand

**Why:**
- Minimal boilerplate
- Built-in persist middleware
- Works well with React Native
- Simple async actions

### 4. Local Patient Storage

**Chose:** On-device only, no cloud sync

**Why:**
- PHI security requirements
- Avoids HIPAA-compliant infrastructure complexity
- Export to CSV for backup
- Keychain backup provides some redundancy

### 5. Inverted FlatList for Chat

**Chose:** `inverted={true}` with reversed messages array

**Why:**
- Native iOS chat behavior (newest at bottom)
- Reliable scroll-to-bottom without `maintainVisibleContentPosition` bugs
- Simpler auto-scroll logic (`scrollToOffset({ offset: 0 })`)
- Avoids snap-back issues when manually scrolling

### 6. No Connection Splash Screen

**Chose:** Instant app launch, connect in background (Build 23)

**Why:**
- Users expect immediate app access
- Connection can happen silently while chat loads
- Missed notifications are auto-synced on launch (Build 24)
- Failed connections handled gracefully with retry

**History:** Builds 17-22 experimented with a "breathing crystal ball" splash screen during connection, but user testing showed it felt slower than necessary.

---

## Performance Considerations

### Message Limit

Chat store limits to **100 persisted messages** to prevent:
- SecureStore size limits (~2KB per item, JSON chunking)
- Slow app startup from large state hydration
- Memory bloat on older devices

### Lazy Loading

- Calendar events loaded on-demand
- Patient data loaded from persisted store on startup
- Images not persisted (referenced by URI only)

---

## Push Notification Architecture

### Overview

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Echo App       │      │   Sync Server    │      │   Supabase       │
│   (iOS device)   │      │   (Mac Mini)     │      │   (Cloud DB)     │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         │ Register push token     │                         │
         │ ─────────────────────────────────────────────────>│
         │                         │                         │
         │                         │  Query device tokens    │
         │                         │ ─────────────────────────>
         │                         │                         │
         │                         │  Send push via Expo     │
         │   <───────────────────────────────────────────────│
         │                         │                         │
         │ Store notification ack  │                         │
         │ ─────────────────────────────────────────────────>│
         │                         │                         │
```

### Notification Types

| Type | Trigger | Timing | Ack Required |
|------|---------|--------|--------------|
| Meeting Reminder | Upcoming calendar event | 15/10/5 min before | Yes (snooze/dismiss) |
| Message Preview | New message from Echo | Immediate | No |
| Daily Brief | Scheduled | 6:30 AM | No |

### Supabase Tables

- `device_tokens` — Expo push tokens per user
- `notification_acks` — Tracks which notifications were acknowledged

### Server Integration

The sync server (`server/index.js`) includes endpoints:
- `POST /notify/meeting` — Send meeting reminder
- `POST /notify/message` — Send message preview (also queues for sync)
- `POST /notify/brief` — Send daily brief
- `GET /messages/pending` — Get queued messages for sync (Build 25)
- `POST /messages/ack` — Acknowledge synced messages (Build 25)

Uses `expo-server-sdk` for push delivery.

### Message Sync (Build 25)

Push notifications can fail (device offline, iOS limits, etc). Build 25 adds server-side message queuing:

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   OpenClaw       │      │   Sync Server    │      │   Echo App       │
│   Gateway        │      │   (Mac Mini)     │      │   (iOS device)   │
└────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
         │                         │                         │
         │ POST /notify/message    │                         │
         │ ───────────────────────>│                         │
         │                         │                         │
         │                         │ 1. Queue message locally│
         │                         │    (pending-messages.json)
         │                         │                         │
         │                         │ 2. Send push notification
         │                         │ ───────────────────────>│
         │                         │                         │
         │                         │ (Push may fail or delay)│
         │                         │                         │
         │                         │     App launches/foregrounds
         │                         │                         │
         │                         │ GET /messages/pending   │
         │                         │ <───────────────────────│
         │                         │                         │
         │                         │ Return queued messages  │
         │                         │ ───────────────────────>│
         │                         │                         │
         │                         │ POST /messages/ack      │
         │                         │ <───────────────────────│
         │                         │                         │
```

This ensures messages appear in chat even if:
- Push notification is delayed or dropped
- App was force-killed (no notification center access)
- iOS purged notifications from notification center

---

## Future Architecture

### Completed

1. **Push Notifications** ✅ — Expo push via APNs for meeting reminders, messages, daily briefs
2. **Network Status UI** ✅ — Connection quality indicator, message status, toast notifications (Build #5)
3. **Immediate Response UX** ✅ — Instant feedback + background task handling (Builds 12-16)
   - Immediate "thinking" placeholder while AI processes
   - Background task wrapper ensures completion even when backgrounded
   - Local push notification when response arrives in background
   - Replaced streaming approach with simpler request/response + visual feedback

### Planned Additions

1. **iCloud Sync** — Optional encrypted backup for settings
2. **Widget Extension** — Quick voice input from home screen

### Not Planned

- Multi-user support (single user app)
- Web version (native iOS/macOS focus)
- Server-side message storage (privacy by design)
