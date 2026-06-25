# Architecture

> Echo App System Design & Technical Overview

**Last Updated:** June 24, 2026

---

## Overview

Echo App is a React Native (Expo) application that provides Oliver with a private interface to interact with Echo, his AI assistant. The app connects to the OpenClaw Gateway via HTTP API for message exchange.

```
┌─────────────────────────────────────────────────────────────────┐
│                         ECHO APP (iOS)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React Native + Expo SDK 52                               │  │
│  │                                                           │  │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ │  │
│  │  │ Chat UI   │ │ Dictation │ │ Patients  │ │ Settings │ │  │
│  │  │(voice+txt)│ │(OR reports│ │(call list)│ │(gw,voice)│ │  │
│  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └────┬─────┘ │  │
│  │        │              │             │             │        │  │
│  │  ┌─────▼──────────────▼─────────────▼─────────────▼─────┐│  │
│  │  │              Zustand Stores (Persistent)              ││  │
│  │  │ chatStore │ dictationStore │ patientDictationsStore   ││  │
│  │  │ patientsStore │ settingsStore │ authStore             ││  │
│  │  └──────────────────────┬────────────────────────────────┘│  │
│  │                         │                                 │  │
│  │  ┌──────────────────────▼────────────────────────────────┐│  │
│  │  │        AsyncStorage + expo-secure-store (Keychain)     ││  │
│  │  │     Split local persistence for transcripts / PHI      ││  │
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
| **Storage** | AsyncStorage + expo-secure-store | Split local transcript storage and encrypted Keychain storage |
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
│   ├── patient-dictation.tsx      # Patient-linked OR dictation (modal)
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
│   ├── data/                     # Static data & templates
│   │   ├── templates/            # Operative report templates (markdown)
│   │   │   ├── README.md         # Template format docs
│   │   │   ├── aortic.md         # Aortic procedures
│   │   │   ├── carotid.md        # Carotid procedures
│   │   │   ├── peripheral.md     # Peripheral arterial
│   │   │   ├── venous.md         # Venous procedures
│   │   │   ├── dialysis-access.md# Dialysis access
│   │   │   └── other.md          # Amputations, central lines, etc.
│   │   ├── templateContent.ts    # Compiled template data
│   │   ├── templateLoader.ts     # Runtime template selection & loading
│   │   └── vascularProcedures.ts # Categorized procedure library + CPT/ICD-10
│   │
│   ├── lib/                      # Core transport & utility modules
│   │   ├── transport.ts          # Transport manager (WS + polling orchestration)
│   │   ├── longpoll.ts           # HTTP long-polling fallback transport
│   │   ├── messageHandler.ts     # Shared gateway event handler
│   │   └── websocket.ts          # WebSocket client (deprecated → transport.ts)
│   │
│   ├── services/                 # External service clients
│   │   ├── crashLog.ts           # Crash logging (AsyncStorage, FIFO, max 20)
│   │   ├── gateway.ts            # OpenClaw Gateway API
│   │   ├── gatewayBootstrap.ts   # Supabase RPC bootstrap (gateway config + API keys)
│   │   ├── elevenlabs.ts         # Text-to-speech (+ generateAudio/playAudioFile/pause/resume)
│   │   ├── whisper.ts            # Speech-to-text
│   │   ├── timezone.ts           # Timezone detection & dual-time formatting
│   │   ├── calendar.ts           # Google Calendar
│   │   ├── dictationService.ts   # OR report generation via Gateway
│   │   ├── dictationSync.ts      # Finalized dictation sync + retry queue
│   │   ├── notifications/        # Push notification service
│   │   │   └── index.ts          # Expo push registration & handling
│   │   └── supabase.ts           # Supabase client for push tokens
│   │
│   ├── stores/                   # Zustand state stores
│   │   ├── authStore.ts          # Authentication state
│   │   ├── chatStore.ts          # Chat messages (persisted)
│   │   ├── patientsStore.ts      # Patient list (persisted)
│   │   ├── patientDictationsStore.ts # Per-patient OR dictations (AsyncStorage)
│   │   ├── settingsStore.ts      # App settings (persisted)
│   │   ├── calendarStore.ts      # Calendar events
│   │   ├── networkStore.ts       # Connection state + toasts
│   │   └── websocketStore.ts     # WebSocket/transport connection state
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

### Finalized Dictation Sync Flow

```
1. User finalizes or edits a patient dictation
                    │
                    ▼
2. patientDictationsStore updates local AsyncStorage state
                    │
                    ▼
3. dictationSync.ts filters to finalized dictations only
   and strips transcript parts to sync-safe fields
                    │
                    ▼
4. POST /patients/dictations/sync
   (server also mirrors root-level /dictations/* routes)
   Authorization: Bearer <gateway-token>
                    │
                    ▼
5. Mac mini sync server writes dictations.json
   as the current finalized-report snapshot for retrieval/backstop outside the device
                    │
                    ▼
6. On failure, in-memory retry queue retries up to 3 times
```

### Meeting Reply Card Flow

```
1. OpenClaw posts a scheduling request to /notify/meeting-reply
                    │
                    ▼
2. Sync server validates the requested window, duration, and workday bounds
                    │
                    ▼
3. Server calls gog calendar events for Oliver's configured calendar account
                    │
                    ▼
4. Busy events are converted into conflict blocks and clean slots are suggested
                    │
                    ▼
5. Server builds a meeting_reply RichCard with reply text, slots, and conflicts
                    │
                    ▼
6. Card is queued in pending-messages.json and optionally sent via Expo push
                    │
                    ▼
7. Echo App hydrates the card from push/server sync and renders copy-ready UI
   in both ChatMessage and the message detail sheet
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
| `chatStore` | AsyncStorage | ❌ | Last 100 messages |
| `dictationStore` | AsyncStorage | ❌ | Learned templates, examples, custom procedures |
| `patientDictationsStore` | AsyncStorage | ❌ local store, synced finals over HTTPS | Per-patient draft/final dictations |
| `patientsStore` | SecureStore | ✅ Keychain | Patient list, call days |
| `settingsStore` | SecureStore | ✅ Keychain | API keys, preferences |

### What's Ephemeral

| Store | Contents |
|-------|----------|
| `authStore` | Session tokens (future) |
| Connection state | `isConnected`, `avatarState` |

### Persistence Implementation

Echo App now uses two persistence tiers:

- **AsyncStorage** for chat transcripts (`chatStore`) where payload size grows over time and secret storage is not required
- **SecureStore** for secrets and sensitive local data (`settingsStore`, patient-related stores, auth token writes)

`chatStore` also includes a one-time migration path from the legacy SecureStore-backed `echo-chat` key into AsyncStorage, plus a pre-hydration write lock so startup state cannot overwrite stored history before hydration completes.

```typescript
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const chatStorage = {
  getItem: async (name) => {
    const value = await AsyncStorage.getItem(name);
    if (value) return value;

    const legacyValue = await SecureStore.getItemAsync(name);
    if (legacyValue) {
      await AsyncStorage.setItem(name, legacyValue);
      await SecureStore.deleteItemAsync(name);
      return legacyValue;
    }

    return null;
  },
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
    await SecureStore.deleteItemAsync(name);
  },
};
```

---

## Security Model

### Data Protection

| Data Type | Protection |
|-----------|------------|
| Chat messages | AsyncStorage (local only, non-secret transcript storage) |
| Patient PHI | SecureStore (Keychain encryption) |
| API keys | SecureStore (Keychain encryption) |
| Gateway token | SecureStore (Keychain encryption) |
| Auth tokens | SecureStore with `AFTER_FIRST_UNLOCK` accessibility |

### Network Security

- All traffic over HTTPS via Cloudflare Tunnel
- Gateway URL: `https://echo.oppersmedical.com`
- Bearer token authentication for API calls
- **Gateway Bootstrap (Build 55):** No secrets in binary — gateway config and API keys fetched from Supabase RPC after authentication
  - `get_gateway_config()` RPC with SECURITY DEFINER + RLS
  - Replaces baked-in obfuscated credentials (Level 1 bridge removed)
  - Also bootstraps OpenAI and ElevenLabs keys if missing (Build 59)
- **Credential Hardening (Build 54):** Keychain accessibility set to `AFTER_FIRST_UNLOCK`; obfuscated XOR fallback survives SecureStore loss
- **WebSocket URL Derivation (Build 58):** WS URL derived from gateway URL (no hardcoded endpoints); uses `wss://` for TLS on hospital Wi-Fi

### PHI Considerations

Patient data is minimized by design:
- General patient list data remains local on device in SecureStore
- Finalized operative report dictations are synced only to Oliver's Mac mini sync server over authenticated HTTPS for retrieval and backup, using dedicated `dictations.json` storage plus authenticated list/detail endpoints
- Patient data is not sent to the OpenClaw chat completion endpoint
- Export feature produces local CSV only

---

## Key Design Decisions

### 1. HTTP API + Multi-Transport Push (WS → Polling Fallback)

**Chose:** HTTP API for chat completions, with adaptive push transport (WebSocket primary, long-polling fallback)

**HTTP (`/v1/chat/completions`):**
- OpenAI-compatible endpoint for sending messages
- Works through Cloudflare Tunnel without issues
- Simple request/response model

**Transport Manager (`src/lib/transport.ts`) — Build 52:**
- Orchestrates WebSocket (primary) and long-polling (fallback) transports
- Auto-switch: 3 consecutive WS failures within 60s triggers polling mode
- Auto-recovery: retries WS every 5 minutes while polling, upgrades seamlessly
- Shared `messageHandler.ts` for consistent event processing across both transports
- Exposes `transportMode` via `websocketStore` for UI feedback

**WebSocket (`src/lib/websocket.ts`) — deprecated in favor of transport.ts:**
- Real-time push for incoming messages, calendar events, patient data
- Robust auto-reconnect with exponential backoff (2s → 30s cap, retries forever)
- Ping/pong heartbeat every 25s with 10s pong timeout for zombie connection detection
- AppState-aware: instant reconnect when app returns to foreground
- Any incoming message resets pong timeout (proves connection alive)

**Long-Polling (`src/lib/longpoll.ts`) — Build 52:**
- Fallback for restrictive networks (hospital Wi-Fi that blocks WebSocket)
- Tries `/poll` endpoint with 25s long-hang; degrades to `/ping` short-polling every 10s on 404
- Same message handling pipeline as WebSocket via shared `messageHandler.ts`

### 2. SecureStore vs AsyncStorage

**Chose:** Split storage by data type

**AsyncStorage for chat transcripts:**
- Better fit for growing conversation history
- Avoids SecureStore size brittleness for large transcript payloads
- Keeps chat local without treating transcripts like secrets

**SecureStore for secrets + PHI:**
- Hardware-backed encryption on iOS (Keychain)
- Required for storing patient data and credentials
- Auth token writes use `AFTER_FIRST_UNLOCK` for more reliable cold-start restore

### 3. Zustand vs Redux/Context

**Chose:** Zustand

**Why:**
- Minimal boilerplate
- Built-in persist middleware
- Works well with React Native
- Simple async actions

### 4. Local-First Patient Storage with Finalized Dictation Sync

**Chose:** Keep patient lists local, but sync finalized operative reports to Oliver's Mac mini

**Why:**
- PHI security requirements still favor local-first storage on device
- Finalized reports benefit from server-side retrieval/backstop without sending patient context into chat completion flows
- Sync is narrow in scope: finalized dictations only, over authenticated HTTPS, with retry logic on failure
- Export to CSV remains available for local backup

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

### 7. Hydration-Gated Writes (Build 45)

**Problem:** On cold start, Zustand initializes stores with default (null) state before hydration from SecureStore completes. Any store listener or side-effect that triggers a write during this window overwrites real credentials with nulls.

**Solution:** A module-level `_hydrated` flag in `settingsStore` blocks all `secureStorage.setItem` calls until `onRehydrateStorage` fires. `_layout.tsx`, `ConnectionSplash`, and `useGateway` all coordinate around this flag to avoid acting on pre-hydration state.

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
- `POST /notify/meeting-reply` — Generate a calendar-checked scheduling reply and queue a `meeting_reply` rich card
- `GET /messages/pending` — Get queued messages for sync (Build 25)
- `POST /messages/ack` — Acknowledge synced messages and record an `acked` event in `notification-deliveries.json` (Build 25 / Build 66 ledger)
- `POST /dictations/sync` and `POST /patients/dictations/sync` — Persist the current finalized operative-report set to `dictations.json`
- `GET /dictations/list` / `GET /dictations/:id` — Root-level finalized dictation retrieval
- `GET /patients/dictations/list` / `GET /patients/dictations/:id` — Cloudflare-tunneled finalized dictation retrieval

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

The server keeps two local notification artifacts: `pending-messages.json` for delivery and `notification-deliveries.json` for receipt events such as app acknowledgements. Queued messages may include rich-card payloads; Build 66 uses this for `meeting_reply` cards, sends a compact card through APNs, and preserves the full card in the server queue so missed-notification sync can still render the full structured card.

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
