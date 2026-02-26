# Changelog

All notable changes to Echo App are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Build 34] - 2026-02-25

### Fixed
- **Notification→Chat Hydration Race** — All notification sync paths (cold-start tap, missed notification scan, server message sync) now await SecureStore hydration before processing, preventing messages from being overwritten by stale rehydrated state
- **Universal Notification→Chat Handshake** — Server now queues every `/notify` call as a pending message (not just `type=message`); app accepts any notification type with `messageId`+`messageContent`; notification tap triggers server sync for reliable delivery. Fixes morning briefs and other non-message notifications not loading into chat when tapped
- **Pre-Hydration Message Queue** — chatStore queues messages added during hydration and replays them after rehydration completes, closing the cold-start race window

### Changed
- `server/index.js` — All `/notify` calls now write to pending messages queue (server is source of truth)
- `src/stores/chatStore.ts` — Added hydration-aware message queue with `onRehydrateStorage` hook
- `src/services/notifications/index.ts` — Simplified routing; all notification taps with content go through message handler

---

## [Build 33] - 2026-02-24

### Added
- **TTS Auto-Play for Notification Messages** (Build #33) — Messages arriving via push notifications (morning briefs, reminders, meeting alerts) now trigger ElevenLabs TTS auto-play when voice is enabled. Previously only live chat responses would speak.

### Fixed
- **Push Message Sync via Cloudflare Tunnel** (Build #33) — Message sync now routes through `/patients/messages/*` path (already tunneled), fixing messages not appearing in app when notifications were tapped
- **APNs Payload Size Cap** (Build #33) — `messageContent` in push data capped at 2000 chars to avoid APNs 4KB truncation; full messages preserved in server queue for reliable sync

---

## [Unreleased]

### Fixed
- **Keyboard Covering Image Preview** (Build #31) — Image preview now scrolls up and shrinks when keyboard opens, preventing caption input from being hidden behind the keyboard
- **Image Send API Format** (Build #29) — Fixed OpenResponses API format: `input_image` goes inside message content array instead of top-level
- **Background Request Reliability** — Removed abort timeout for long-running background requests; re-sends without timeout so tasks can complete indefinitely. Added fallback polling (4×30s) if the no-timeout request also fails, checking for new assistant messages before showing an error.
- **Stale Calendar Cache Clearing** (Build #28) — Cached events from a previous day are now cleared on app rehydration, preventing ghost events (e.g. old recurring meetings) from persisting across days

### Added
- **Image Caption Input** (Build #29) — Caption/question text field added to image picker
  - Optional caption before sending; defaults to "What do you see in this image?"
  - Simplified button label from "Send for Analysis" to "Send"
- **Image Analysis Support** (Build #26-27) — Send photos to Echo for vision analysis
  - ImagePicker passes base64 + mimeType to gateway handler
  - GatewayService builds OpenAI-compatible multipart content with `image_url`
  - Shows "Analyzing your image..." placeholder while processing
  - Handles long tasks (>30s) with push notification on completion
- **Server-Side Message Sync** (Build #25) — Reliable message delivery even when push fails
  - Server queues messages in `pending-messages.json` (last 50 retained)
  - New endpoints: `GET /messages/pending`, `POST /messages/ack`
  - App fetches pending messages on launch + foreground
  - Dual sync: server queue + notification center for maximum reliability
  - Automatically acknowledges messages after syncing to chat
- **Auto-Sync Missed Notifications** (Build #24) — App syncs any missed notifications on launch
- **Baked-in Gateway Credentials** (Build #22) — Gateway URL and token embedded in build
  - No manual configuration needed for production builds
  - Settings still available for development/override
- **Quick Response Timeout** (Build #19) — 30-second timeout for responsive UX on long tasks
- **Foreground Notification Chat Integration** (Build #18) — Notifications received while app is open now appear directly in chat
- **Immediate Response UX** (Build #16) — Instant feedback while waiting for AI
  - User message shows with 'sending' status immediately
  - "Got it, working on this..." placeholder appears instantly
  - Pulsing animation while AI is processing
  - Local push notification when response arrives in background
  - New `ThinkingIndicator` component in ChatMessage
- **Background Task Support** (Build #12) — Reliable iOS background handling
  - Background task wrapper ensures API calls complete when app backgrounded
  - Push notification fallback for responses arriving while suspended
  - Foreground recovery: responses appear immediately on resume
  - APNs token pass-through for gateway awareness
  - Added `expo-background-fetch` and `expo-task-manager` dependencies
- **TTS Speaker Button** (Build #11) — Tap speaker icon on Echo's messages for voice playback
- **Network Status UI** (Build #5) — Real-time connection feedback
  - `NetworkIndicator` component with 3-tier signal strength
  - `ToastContainer` for ephemeral notifications
  - Message status indicators (sending/sent/failed)
  - New `networkStore` for connection state management
- **Push Notifications** (Build #4) — Native push notification infrastructure
  - Meeting reminders (15/10/5 min with acknowledgment)
  - Message preview notifications
  - Daily brief notifications (6:30 AM)
  - Expo push token registration
  - Supabase integration for device tokens and notification acks
  - Server-side push sending via expo-server-sdk
  - New `useNotifications` hook for app integration
- **Network Status UI Spec** — Build #5 roadmap document
  - Connection quality indicator (3-tier signal strength)
  - Message status indicators (sending/sent/failed)
  - Toast notification system
  - Network diagnostics screen
- Chat message persistence via SecureStore
  - Messages now survive app crashes and restarts
  - Limited to last 100 messages to prevent storage bloat
  - Uses encrypted iOS Keychain storage
- **Text Size Accessibility** — Adjustable text size in Settings
  - Three options: Normal, Large, Extra Large
  - Affects chat messages and input field
  - New `useScaledTypography` hook for consistent scaling
- **Automated Patient Sync** — Background sync from WhatsApp/Gateway
  - New sync server (`server/`) with Cloudflare Tunnel support
  - Settings UI toggle for enabling/disabling sync
  - Uses `usePatientSync` hook for client-side integration

### Changed
- Avatar idle/thinking animations refined for consistency
  - Slower, calmer breathing animation in idle state
  - Thinking animation now matches idle pacing

### Fixed
- **Connection Splash Removed** (Build #23) — Splash screen removed for instant app launch
  - Connection happens seamlessly in background
  - No more blocking UI during gateway connect
- **Duplicate useGateway Fix** (Build #21) — Prevents multiple gateway initializations causing connection failure
- **Splash Screen Edge Cases** (Build #20) — Properly hides splash on connection failure
- **Gateway reliability** (Builds 13-16) — Robust connection handling
  - Request queue serializes gateway calls (prevents race conditions)
  - 60s timeout with AbortController (up from 20s)
  - Per-message loading state (no more global "thinking" stuck)
  - Health check on send failure for accurate connection status
  - URL normalization (strips trailing slashes)
  - Better error messages for auth failures (401/403)
  - Unique session ID per device (prevents queue conflicts)
- **Calendar speed** (Build #15) — Fast calendar API endpoint
  - Direct API on port 18791 (~800ms vs 10-20s via AI)
  - Tries public URL first, then local IP, then fallback to gateway
  - 3s timeout per endpoint for quick failover
- **Notification tap** (Build #13) — Tapping notification shows message in chat
  - Notifications include messageId, messageContent, timestamp
  - Message appears immediately in chat when tapped
- **Build number visible** (Build #14) — Version shown in Settings screen
- **Chat scroll behavior** (Builds 6-10) — Reliable scroll-to-latest
  - Switched to inverted FlatList for natural chat UX
  - Removed problematic `maintainVisibleContentPosition` on iOS
  - Fixed snap-back issues when scrolling manually
  - Removed `selectable` prop causing FlatList flickering on iOS
  - Always scrolls to latest message on new arrivals
- **Voice animation timing** — Animation now syncs with actual audio playback
  - Added `isLoadingAudio` state for TTS fetch tracking
  - Shows "Preparing voice..." while fetching audio
  - Avatar only enters speaking state when audio actually plays
- **Keyboard input fields** — Keyboard no longer covers input fields
  - Replaced KeyboardAvoidingView with KeyboardAwareScrollView
  - Applied to all modals: Login, Add/Edit/Pending Patient, Scan Confirm
  - Added react-native-keyboard-aware-scroll-view package
- Chat screen now scrolls to latest message on load
- Patient list timezone handling for date grouping
  - Uses local timezone consistently
  - Auto-repairs displayDate/dayOfWeek from date field
- Patient list duplicate date groups prevented
- Patient card layout allows name wrapping while keeping room badge visible
- Empty/hallucinated voice transcriptions filtered out

---

## [0.2.0] - 2026-02-06

### Added
- **Patients Tab** — On-call patient tracking
  - Call day organization with hospital grouping
  - Quick add with voice input for chief complaint
  - Image scanning to extract patient details
  - Search across all patients
  - CSV export for backup
  - Persistent storage via SecureStore

- **Voice Input** — Speech-to-text for patient forms
  - Uses OpenAI Whisper API
  - Audio level visualization
  - Recording duration display

- **Image Scanning** — Extract patient info from photos
  - Camera and photo library support
  - OCR via OpenAI Vision
  - Editable results before adding

- **Pending Patient Flow**
  - Receive patient info from WhatsApp
  - Review and edit before adding to list
  - Haptic notification on arrival

### Changed
- Improved avatar state transitions
- Better error handling for gateway connection

### Fixed
- Gateway URL whitespace handling
- Connection status sync between hook and store

---

## [0.1.0] - 2026-02-02

### Added
- **Initial Release** — Core chat functionality
  - Real-time conversation with Echo
  - Voice input (tap avatar to record)
  - Voice output (ElevenLabs TTS)
  - Animated avatar with state indicators
  - Dark theme based on Echo's color palette

- **Gateway Integration**
  - OpenAI-compatible HTTP API
  - Bearer token authentication
  - Health check with retry

- **Settings Screen**
  - Gateway URL and token configuration
  - Voice on/off toggle
  - API key management (OpenAI, ElevenLabs)
  - Haptic feedback toggle

- **Tab Navigation**
  - Chat (main)
  - Today (calendar placeholder)
  - Patients (placeholder)
  - Settings

---

## Development Milestones

### Phase 1: MVP ✅
- [x] Project setup (Expo, TypeScript, navigation)
- [x] Basic chat UI (send/receive text)
- [x] HTTP API connection to Gateway
- [x] Voice input (record → Whisper → send)
- [x] Voice output (TTS playback)
- [x] Animated avatar (basic states)
- [x] Settings screen
- [ ] Push notifications (deferred)
- [ ] Authentication (deferred)

### Phase 2: Polish (In Progress)
- [x] Patient tracking feature
- [x] Chat message persistence
- [ ] Streaming message display
- [ ] Rich cards (calendar, email)
- [ ] Image/file attachments
- [ ] Memory transparency view

### Phase 3: Platform Integration (Planned)
- [ ] iOS home screen widget
- [ ] Siri Shortcuts
- [ ] macOS support

---

## Upgrade Notes

### 0.1.0 → 0.2.0

No migration needed. Patient data uses new SecureStore keys.

### Pre-0.2.0 → 0.2.0+

Chat history will start fresh (no prior persistence).

---

*Maintained by Echo 🔮*
