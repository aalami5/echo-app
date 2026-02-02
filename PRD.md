# Echo App — Product Requirements Document

**Version:** 0.1.0-draft  
**Author:** Echo (with Oliver)  
**Date:** February 2, 2026  
**Status:** Draft

---

## 1. Executive Summary

Echo App is a native iOS/macOS application that provides Oliver with a premium, private interface to interact with Echo (his AI assistant). It replaces the current WhatsApp-based interaction with a purpose-built experience featuring voice-first interaction, animated avatar, push notifications, and multi-modal input.

### Why Build This?

| Current State (WhatsApp) | Target State (Echo App) |
|-------------------------|------------------------|
| No push notifications | Native iOS/macOS notifications |
| Text-only practical | Voice-first, text-optional |
| Generic chat UI | Custom UI with animated avatar |
| No rich content | Interactive cards, actions |
| Shared platform | Private, secure, yours |

---

## 2. Goals & Success Metrics

### Primary Goals
1. **Reliable communication** — Messages always get through, notifications always fire
2. **Voice-first interaction** — Talk naturally, like calling a friend
3. **Delightful experience** — Animated avatar, haptics, polish that sparks joy
4. **Privacy & security** — 2FA, biometrics, E2EE, full data control

### Success Metrics
- 100% notification delivery rate
- <2s latency from send to response start
- Daily active usage (Oliver uses it as primary Echo interface)
- Zero security incidents

---

## 3. User Stories

### Authentication & Security
- [ ] As Oliver, I can log in with Face ID / Touch ID so access is fast but secure
- [ ] As Oliver, I have 2FA enabled so even if my device is compromised, the app is protected
- [ ] As Oliver, I can see all active sessions and revoke any of them
- [ ] As Oliver, I can wipe all local data with one action if needed

### Core Messaging
- [ ] As Oliver, I can type a message and send it to Echo
- [ ] As Oliver, I can tap and hold to record a voice message that gets transcribed and sent
- [ ] As Oliver, I can attach an image from camera or photo library
- [ ] As Oliver, I can attach a file (PDF, document)
- [ ] As Oliver, I see Echo's responses in real-time (streaming)
- [ ] As Oliver, I receive push notifications for Echo's messages
- [ ] As Oliver, I can see message history with search

### Voice Interaction
- [ ] As Oliver, I can hear Echo's responses spoken aloud (TTS)
- [ ] As Oliver, I can toggle between text-only, voice-only, or both
- [ ] As Oliver, I can set a preferred voice for Echo
- [ ] As Oliver (future), I can say "Hey Echo" to start a voice interaction

### Avatar & UI
- [ ] As Oliver, I see an animated Echo avatar that reflects current state (thinking, speaking, listening, idle)
- [ ] As Oliver, I feel subtle haptic feedback during interactions
- [ ] As Oliver, I see rich interactive cards for calendar events, emails, tasks
- [ ] As Oliver, I can tap cards to take actions (accept meeting, reply to email, etc.)

### Widgets & Integration
- [ ] As Oliver, I have a home screen widget for quick voice capture
- [ ] As Oliver, I can use Siri Shortcuts to query Echo
- [ ] As Oliver, I can continue a conversation from iPhone to Mac (Handoff)
- [ ] As Oliver (future), I can interact via Apple Watch

### Privacy & Transparency
- [ ] As Oliver, I can view what Echo "knows" (memory, preferences)
- [ ] As Oliver, I can edit or delete items from Echo's memory
- [ ] As Oliver, I can export all my data
- [ ] As Oliver, I can delete all my data permanently

---

## 4. Technical Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ECHO APP                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  React Native + Expo                                      │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │  │
│  │  │ Chat UI     │ │ Voice I/O   │ │ Avatar Animation    │ │  │
│  │  │             │ │ (expo-av)   │ │ (Lottie/Rive)       │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘ │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │  │
│  │  │ Auth        │ │ Push        │ │ Widgets             │ │  │
│  │  │ (Biometric) │ │ (APNs)      │ │ (iOS WidgetKit)     │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket + REST
                              │ (E2EE optional)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ECHO GATEWAY                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  OpenClaw Gateway (existing)                              │  │
│  │  + Echo App Channel Plugin (new)                          │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │  │
│  │  │ Auth/JWT    │ │ WebSocket   │ │ Push Notification   │ │  │
│  │  │ Validation  │ │ Handler     │ │ Service             │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Claude API (Anthropic)                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  TTS Service (ElevenLabs)                                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  STT Service (Whisper API)                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐   │
│  │ Supabase    │ │ Supabase    │ │ Apple Push Notification │   │
│  │ Auth        │ │ Storage     │ │ Service (APNs)          │   │
│  │ (2FA, JWT)  │ │ (media)     │ │                         │   │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **App Framework** | React Native + Expo | SDK 52+ | Cross-platform, mature, great DX, Expo handles native complexity |
| **Language** | TypeScript | 5.x | Type safety, better tooling |
| **State Management** | Zustand | 4.x | Simple, fast, works with React Native |
| **Navigation** | Expo Router | 4.x | File-based routing, deep linking |
| **Authentication** | Supabase Auth | 2.x | 2FA, magic links, biometrics via native module |
| **Real-time** | WebSocket (native) | - | Low latency, bi-directional |
| **Push Notifications** | expo-notifications + APNs | - | Native iOS/macOS push |
| **Voice Recording** | expo-av | 14.x | Audio recording, playback |
| **Speech-to-Text** | OpenAI Whisper API | - | High accuracy, handles accents |
| **Text-to-Speech** | ElevenLabs API | - | Natural voices, already integrated |
| **Animation** | Lottie (lottie-react-native) | 6.x | Vector animations, small file size |
| **Haptics** | expo-haptics | - | Native haptic feedback |
| **Storage (local)** | expo-secure-store | - | Encrypted local storage |
| **Storage (cloud)** | Supabase Storage | - | Media files, attachments |
| **Widgets** | react-native-widget-extension | - | iOS home screen widgets |
| **Siri Shortcuts** | expo-shortcuts (or native) | - | Siri integration |

### API Design

#### Authentication Flow

```
1. App Launch
   └─► Check for stored refresh token (secure store)
       ├─► Found: Attempt token refresh
       │   ├─► Success: Proceed to biometric verification
       │   └─► Failure: Show login screen
       └─► Not found: Show login screen

2. Login
   └─► Email + Password
       └─► 2FA Challenge (TOTP)
           └─► Success: Store tokens, proceed to biometric setup

3. Biometric Setup (first time)
   └─► Prompt to enable Face ID / Touch ID
       └─► Store biometric-protected credential

4. Subsequent Opens
   └─► Biometric verification
       └─► Success: Access app
```

#### WebSocket Protocol

```typescript
// Client → Server
interface ClientMessage {
  type: 'message' | 'typing' | 'ack' | 'ping';
  id: string;           // unique message ID
  timestamp: number;    // Unix ms
  payload: {
    text?: string;      // text content
    audio?: string;     // base64 audio for STT
    image?: string;     // media URL or base64
    file?: string;      // file URL
  };
}

// Server → Client
interface ServerMessage {
  type: 'message' | 'typing' | 'status' | 'pong';
  id: string;
  timestamp: number;
  payload: {
    text?: string;      // text content (may stream)
    audio?: string;     // TTS audio URL
    card?: RichCard;    // interactive card
    state?: AvatarState; // avatar state hint
  };
  streaming?: boolean;  // true if message is streaming
  final?: boolean;      // true if streaming complete
}

type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert';

interface RichCard {
  type: 'calendar' | 'email' | 'task' | 'link' | 'custom';
  title: string;
  subtitle?: string;
  body?: string;
  actions?: CardAction[];
  data?: Record<string, unknown>;
}

interface CardAction {
  label: string;
  action: string;  // action identifier
  style?: 'default' | 'primary' | 'destructive';
}
```

#### REST Endpoints (Gateway)

```
POST   /api/echo/auth/login        # Email + password login
POST   /api/echo/auth/verify-2fa   # 2FA verification
POST   /api/echo/auth/refresh      # Token refresh
POST   /api/echo/auth/logout       # Logout, invalidate tokens
GET    /api/echo/auth/sessions     # List active sessions
DELETE /api/echo/auth/sessions/:id # Revoke session

GET    /api/echo/messages          # Message history (paginated)
POST   /api/echo/messages          # Send message (fallback if WS down)
GET    /api/echo/messages/:id      # Get specific message

POST   /api/echo/media/upload      # Upload image/file
GET    /api/echo/media/:id         # Get media

GET    /api/echo/memory            # Get memory items (transparency)
DELETE /api/echo/memory/:id        # Delete memory item

POST   /api/echo/device/register   # Register device for push
DELETE /api/echo/device/:id        # Unregister device

GET    /api/echo/settings          # Get user settings
PATCH  /api/echo/settings          # Update settings
```

### Security Model

#### Authentication Layers

1. **Something you know:** Email + Password
2. **Something you have:** TOTP 2FA (Authy, 1Password, etc.)
3. **Something you are:** Face ID / Touch ID (biometric)

#### Token Security

- Access tokens: 15 minute expiry, stored in memory only
- Refresh tokens: 30 day expiry, stored in Secure Enclave (iOS Keychain)
- Tokens are rotated on each refresh
- All tokens invalidated on password change

#### Data Security

| Data | At Rest | In Transit |
|------|---------|------------|
| Messages | Encrypted (Supabase) | TLS 1.3 |
| Media | Encrypted (Supabase Storage) | TLS 1.3 |
| Auth tokens | Secure Enclave | TLS 1.3 |
| Local cache | Encrypted (expo-secure-store) | N/A |

#### Optional E2EE (Future)

For maximum privacy, implement end-to-end encryption:
- Client generates keypair on first launch
- Public key registered with server
- Messages encrypted client-side before send
- Server cannot read message content
- *Trade-off:* Server-side search not possible

#### Rate Limiting & Abuse Prevention

- 5 failed login attempts → 15 minute lockout
- 100 messages/hour soft limit
- Anomaly detection (unusual location, time, volume)

---

## 5. User Interface

### Design Principles

1. **Voice-first, not voice-only** — Optimize for voice but never block text
2. **Ambient presence** — Echo feels alive even when idle
3. **Progressive disclosure** — Simple surface, power underneath
4. **Calm technology** — Informative but not demanding

### Screen Inventory

#### 1. Chat Screen (Primary)

```
┌─────────────────────────────────────┐
│ ┌─────┐                    ⚙️  │
│ │     │  Echo                       │
│ │ 🔮  │  Online                      │
│ └─────┘                             │
├─────────────────────────────────────┤
│                                     │
│   ┌─────────────────────────────┐   │
│   │ Good morning, Oliver!       │   │
│   │ You have 3 meetings today.  │   │
│   └─────────────────────────────┘   │
│                                     │
│   ┌─────────────────────────────┐   │
│   │ 📅 Team Standup             │   │
│   │ 9:00 AM - 9:30 AM           │   │
│   │ [Join] [Snooze] [Details]   │   │
│   └─────────────────────────────┘   │
│                                     │
│                    ┌─────────────┐  │
│                    │ What's my   │  │
│                    │ schedule?   │  │
│                    └─────────────┘  │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ Message Echo...                 │ │
│ └─────────────────────────────────┘ │
│   📷    🎤    📎                    │
└─────────────────────────────────────┘
```

**Key elements:**
- Animated avatar (top) with state indicator
- Message bubbles (streaming supported)
- Rich cards (calendar, email, tasks)
- Input bar with attachments
- Hold-to-record voice button

#### 2. Voice Mode (Full Screen)

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│           ┌─────────┐               │
│           │         │               │
│           │   🔮    │               │
│           │         │               │
│           └─────────┘               │
│                                     │
│         "Listening..."              │
│                                     │
│    ┌─────────────────────────┐      │
│    │ ░░░░░░░░░░░░░░░░░░░░░░░ │      │
│    │     (waveform)          │      │
│    └─────────────────────────┘      │
│                                     │
│                                     │
│            [ Tap to stop ]          │
│                                     │
└─────────────────────────────────────┘
```

**Triggered by:**
- Long-press mic button
- "Hey Echo" wake word (future)
- Shake gesture (configurable)

#### 3. Settings Screen

```
┌─────────────────────────────────────┐
│ ←  Settings                         │
├─────────────────────────────────────┤
│                                     │
│ ACCOUNT                             │
│ ┌─────────────────────────────────┐ │
│ │ Email: aalami@gmail.com       > │ │
│ │ 2FA: Enabled                  > │ │
│ │ Active Sessions               > │ │
│ └─────────────────────────────────┘ │
│                                     │
│ VOICE                               │
│ ┌─────────────────────────────────┐ │
│ │ Voice Output: On              ⬤ │ │
│ │ Echo's Voice: Nova            > │ │
│ │ Speed: Normal                 > │ │
│ └─────────────────────────────────┘ │
│                                     │
│ NOTIFICATIONS                       │
│ ┌─────────────────────────────────┐ │
│ │ Push Notifications: On        ⬤ │ │
│ │ Sounds: On                    ⬤ │ │
│ │ Focus Mode Behavior           > │ │
│ └─────────────────────────────────┘ │
│                                     │
│ PRIVACY                             │
│ ┌─────────────────────────────────┐ │
│ │ What Echo Knows               > │ │
│ │ Export My Data                > │ │
│ │ Delete All Data               > │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

#### 4. Memory View (Privacy/Transparency)

```
┌─────────────────────────────────────┐
│ ←  What Echo Knows                  │
├─────────────────────────────────────┤
│ 🔍 Search memories...               │
├─────────────────────────────────────┤
│                                     │
│ PREFERENCES                         │
│ ┌─────────────────────────────────┐ │
│ │ Prefers morning briefs at 6:30am│ │
│ │ 📅 Learned: Jan 15, 2026    [✏️]│ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Electronic music fan (Berlin...)│ │
│ │ 📅 Learned: Jan 20, 2026    [✏️]│ │
│ └─────────────────────────────────┘ │
│                                     │
│ PEOPLE                              │
│ ┌─────────────────────────────────┐ │
│ │ Angie - Clinical assistant      │ │
│ │ 📅 Learned: Jan 18, 2026    [✏️]│ │
│ └─────────────────────────────────┘ │
│                                     │
│ RECENT CONTEXT                      │
│ ┌─────────────────────────────────┐ │
│ │ Orlando trip for ACS talk       │ │
│ │ 📅 Feb 1-3, 2026            [🗑️]│ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### Avatar Animation Specs

**States & Behaviors:**

| State | Visual | Trigger |
|-------|--------|---------|
| **Idle** | Gentle ambient pulse, occasional blink | Default state |
| **Listening** | Expands slightly, waveform around edge | Voice recording active |
| **Thinking** | Orbiting particles, slight glow | Waiting for response |
| **Speaking** | Rhythmic pulse synced to TTS | TTS playback active |
| **Alert** | Attention-grabbing pulse, warm color | Important notification |

**Technical implementation:**
- Lottie animations for smooth vector graphics
- Multiple animation files, blended on transition
- State machine manages transitions
- TTS audio analysis drives speaking animation

---

## 6. Development Phases

### Phase 1: MVP (4-6 weeks)

**Goal:** Replace WhatsApp with working alternative

- [ ] Project setup (Expo, TypeScript, navigation)
- [ ] Authentication (Supabase Auth, 2FA, biometrics)
- [ ] Basic chat UI (send/receive text)
- [ ] WebSocket connection to Gateway
- [ ] Push notifications
- [ ] Voice input (record → Whisper → send)
- [ ] Voice output (TTS playback)
- [ ] Static avatar (no animation yet)
- [ ] Basic settings screen
- [ ] TestFlight deployment

**Not in MVP:**
- Animated avatar
- Rich cards
- Widgets
- Watch app
- Handoff
- E2EE

### Phase 2: Polish (3-4 weeks)

**Goal:** Delightful experience

- [ ] Animated avatar with states
- [ ] Haptic feedback
- [ ] Streaming message display
- [ ] Rich cards (calendar, email, tasks)
- [ ] Image/file attachments
- [ ] Message search
- [ ] Memory transparency view
- [ ] Improved error handling

### Phase 3: Platform Integration (3-4 weeks)

**Goal:** Deep iOS/macOS integration

- [ ] iOS home screen widget
- [ ] Siri Shortcuts
- [ ] Handoff (iPhone ↔ Mac)
- [ ] Focus mode integration
- [ ] macOS menu bar mode
- [ ] Conversation threads (branch off tangents without derailing main conversation)

### Phase 4: Advanced (Future)

**Goal:** Premium experience

- [ ] Apple Watch companion app
- [ ] "Hey Echo" wake word
- [ ] End-to-end encryption
- [ ] Conversation branching
- [ ] Offline mode with queue
- [ ] Multiple voice options

---

## 7. Gateway Integration

### New Channel Plugin: `echo-app`

The Echo App will be implemented as a new OpenClaw channel plugin, similar to WhatsApp/Telegram channels.

**Plugin responsibilities:**
1. **WebSocket server** — Handle real-time connections from app
2. **Authentication** — Validate JWT tokens from Supabase
3. **Message routing** — Send/receive messages to/from OpenClaw core
4. **Push notifications** — Send APNs notifications when app is closed
5. **TTS generation** — Generate audio for responses
6. **Rich card generation** — Format calendar/email/task cards

**Configuration:**

```yaml
channels:
  echo-app:
    enabled: true
    allowedUsers:
      - "oliver-user-id"
    websocket:
      port: 8765
      path: /ws
    push:
      apns:
        keyPath: ./certs/apns-key.p8
        keyId: ABC123
        teamId: TEAM123
        bundleId: com.aalami.echo
    tts:
      provider: elevenlabs
      voiceId: "nova"
      speakByDefault: true
    auth:
      supabaseUrl: "https://xxx.supabase.co"
      supabaseAnonKey: "xxx"
      jwtSecret: "xxx"
```

---

## 8. Infrastructure & Deployment

### Services Required

| Service | Purpose | Cost Estimate |
|---------|---------|---------------|
| Supabase (Pro) | Auth, Storage, DB | $25/mo |
| Apple Developer | App Store, APNs | $99/yr |
| ElevenLabs | TTS | ~$22/mo (current) |
| OpenAI | Whisper API | ~$5/mo (estimated) |
| Anthropic | Claude API | (existing) |

### Deployment Pipeline

```
GitHub Repo
    │
    ├── PR → Preview build (Expo)
    │
    └── main → 
        ├── TestFlight (iOS)
        └── Direct install (macOS)
```

### Monitoring

- Sentry for crash reporting
- Custom analytics for usage patterns
- Gateway logs for message delivery

---

## 9. Open Questions

1. **Supabase vs custom auth?** — Supabase is faster to implement, custom gives more control
2. **E2EE in MVP?** — Adds complexity but maximum privacy. Defer to Phase 4?
3. **macOS: Catalyst vs native?** — Catalyst is easier, native is better. Start with Catalyst?
4. **Wake word: on-device vs cloud?** — On-device (Picovoice) is more private, cloud is more accurate
5. **Open source?** — Could benefit others, but exposes architecture. Oliver's call.

---

## 10. Success Criteria

### MVP Launch Criteria
- [ ] Can send/receive text messages reliably
- [ ] Push notifications work 100% of the time
- [ ] Voice input/output works
- [ ] Auth is secure (2FA + biometrics)
- [ ] Oliver prefers it over WhatsApp

### Full Launch Criteria
- [ ] Animated avatar delights
- [ ] Rich cards are actionable
- [ ] Widgets provide quick access
- [ ] Memory view builds trust
- [ ] Stable for 30 days with no major issues

---

## Appendix A: Competitive Analysis

| App | Strengths | Weaknesses | Learn From |
|-----|-----------|------------|------------|
| ChatGPT iOS | Polished, voice mode | Generic, no personalization | Voice mode UX |
| Rabbit R1 | Novel form factor | Limited utility | Ambient presence concept |
| Humane AI Pin | Wearable, always available | Poor execution | Projection UI ideas |
| Replika | Emotional connection, avatar | Not useful, creepy | Avatar personality |

---

## Appendix B: Animation Reference

**Avatar inspiration:**
- Apple Siri orb (fluid, organic)
- Spotify "DJ" animation (friendly, musical)
- Calm app breathing exercises (soothing pulse)

**Key principle:** The avatar should feel alive but not distracting. It's a presence, not a performance.

---

## Appendix C: Privacy Commitment

Echo App will:
- ✅ Use industry-standard encryption
- ✅ Support 2FA and biometrics
- ✅ Provide full data export
- ✅ Allow complete data deletion
- ✅ Show what data is stored (transparency)
- ✅ Never sell or share data

Echo App will NOT:
- ❌ Track analytics beyond crash reporting
- ❌ Include ads
- ❌ Require account creation beyond Oliver
- ❌ Phone home unnecessarily

---

*This is a living document. Update as decisions are made.*
