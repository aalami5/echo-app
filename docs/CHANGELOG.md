# Changelog

All notable changes to Echo App are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [Build 66] - 2026-06-10

### Added
- **Finalized Operative Report Sync** — `patientDictationsStore` now syncs the current set of finalized patient dictations to the Mac mini sync server via new `dictationSync` retry logic. The server persists finalized reports in `dictations.json` and exposes authenticated list/detail endpoints for retrieval and backup
- **Dedicated Dictation Sync Service** — New `src/services/dictationSync.ts` sanitizes transcript parts, queues the latest finalized payload in memory, and retries failed syncs up to 3 times
- **Server Dictation Endpoints** — Sync server now serves both root-level and `/patients/*` dictation sync/list/detail endpoints backed by `dictations.json`
- **Notification Delivery Ledger** — Sync server now initializes `notification-deliveries.json` and records message sync acknowledgements, giving notification/message delivery a local audit trail alongside the existing pending-message queue
- **Meeting Reply Cards** — New `/notify/meeting-reply` server endpoint checks Oliver's Google Calendar via `gog`, finds clean workday slots, queues a rich `meeting_reply` card, and can push a copy-ready suggested reply into chat
- **Rich Notification Cards** — Push/message sync paths now preserve optional `card` payloads so notifications can hydrate structured UI, not just plain text

### Changed
- **Patient Dictation Store Sync Triggers** — Finalized dictations now re-sync when finalized, edited after finalization, or deleted after finalization, keeping the server copy aligned with the device
- **Chat Message Rendering** — Assistant messages with `meeting_reply` cards now render suggested times, checked conflicts, a reply preview, and a copy action; the message detail sheet also exposes copy reply
- **Build bump to 66** for the next iOS/TestFlight build

---

## [Build 65] - 2026-03-30

### Fixed
- **Gateway Auth Scopes Header** — Added `x-openclaw-scopes: operator.write` header to gateway HTTP requests. OpenClaw 2026.3.28 enforces operator scopes on `/v1/chat/completions`, and without this header requests returned 403, breaking dictation report generation

### Changed
- **Build bump to 65** for TestFlight submission

---

## [Build 64] - 2026-03-20

### Added
- **Travel Time Intelligence** — Auto-detects when Oliver is in a different timezone and displays dual-time (local + home/Pacific) on meeting cards. New `timezone.ts` service handles timezone detection, offset calculation, and dual-time formatting. New `timezoneStore` persists timezone state and auto-updates on app foreground

### Changed
- **MeetingCountdown / MeetingDetail / NextMeeting** — Updated to show dual-timezone display when traveling (e.g., "2:00 PM HST / 5:00 PM PST")

---

## [Build 63] - 2026-03-17

### Added
- **OCR Extraction from Uploaded Images in Dictation** — When images are uploaded during dictation (OR whiteboards, patient stickers, consent forms), their text is now extracted via the gateway's vision capability before report generation. Extracted data (patient names, MRNs, dates, diagnoses) is appended to the transcript for AI use

### Changed
- **Removed CPT Codes & Work RVUs Summary from Reports** — Removed the CPT/RVU summary table at the end of operative reports; inline CPT codes in procedure listings are kept

---

## [Build 60] - 2026-03-12

### Changed
- **Operative Report Email — Added Recipient** — Added Rajka.Campbell@sutterhealth.org to operative report email recipients
- **Simplified Email Subject** — Operative report email subject now uses just the date (removed procedure names) for cleaner subject lines

---

## [Build 59] - 2026-03-10

### Added
- **Bootstrap OpenAI + ElevenLabs Keys from Supabase** — Gateway bootstrap RPC now returns `openai_api_key` and `elevenlabs_api_key`; restores these keys after credential loss (only if currently empty, never overwrites user-set keys)

---

## [Build 58] - 2026-03-10

### Fixed
- **Derive WebSocket URL from Gateway URL** — Removed hardcoded `ws://localhost:8765` (nothing listens there); WebSocket URL now derived from `settingsStore.gatewayUrl` (e.g., `https://echo.oppersmedical.com` → `wss://echo.oppersmedical.com`). TLS-encrypted WebSocket works on hospital Wi-Fi (port 443)

---

## [Build 57] - 2026-03-10

### Fixed
- **Stop Double-Sending Messages** — Removed `noAbortPromise` that fired a second request after 30s timeout; original request now continues in background without duplication
- **Eliminate False 'Tap to Retry'** — Added "response already arrived" guard in 3 locations (useGateway main catch, delayed request catch, Chat screen failure handler); before showing "Tap to retry", checks if an assistant response already exists for the conversation turn and suppresses error silently if so

---

## [Build 55] - 2026-03-10

### Added
- **Level 2 Bootstrap Token Exchange** — No secrets in binary:
  - New `gatewayBootstrap` service fetches gateway config from Supabase RPC after authentication
  - Supabase RPC function `get_gateway_config()` returns config only to authenticated users
  - `app_config` table with RLS (no direct access, SECURITY DEFINER function only)
  - Removed hardcoded obfuscated token from settingsStore (Level 1 bridge removed)
  - App layout calls `ensureGatewayConfig()` after auth + settings hydration
  - Migration: `supabase/migrations/004_gateway_bootstrap.sql` (deployed)

---

## [Build 54] - 2026-03-10

### Fixed
- **Hardened Credential Persistence** — Obfuscated gateway token fallback (XOR'd, runtime assembly) so credentials survive SecureStore loss; changed keychain accessibility to `AFTER_FIRST_UNLOCK` (prevents null reads after device reboot); post-hydration validation restores critical keys from hardcoded fallbacks with logging; applied `AFTER_FIRST_UNLOCK` to Supabase auth storage adapter

---

## [Build 53] - 2026-03-10

### Added
- **Read Back Play/Pause Controls** — Deferred playback with Processing → Play → Pause states:
  - `ElevenLabsService`: new `generateAudio()` for audio-only generation, `playAudioFile()` for deferred playback, `pause()` and `resume()` methods
  - Patient dictation Read Back now shows Processing spinner → Play button when ready → Pause/Resume during playback
  - Haptic feedback when audio is ready
  - State resets on dictation change

---

## [Build 52] - 2026-03-09

### Added
- **HTTP Long-Polling Fallback Transport** — Automatic fallback when WebSocket is blocked (e.g., hospital Wi-Fi firewalls):
  - New `transport.ts` — transport manager that orchestrates WS + polling
  - New `longpoll.ts` — tries `/poll` endpoint (25s long-hang), degrades to short-polling `/ping` every 10s on 404
  - New `messageHandler.ts` — shared message handling logic extracted from WS `onmessage`
  - Auto-switch: 3 WS failures within 60s triggers polling fallback
  - Auto-recovery: retries WS every 5 minutes while in polling mode
  - `websocket.ts` marked deprecated in favor of `useTransport`
- **Network Indicator Polling Badge** — Shows yellow 'Limited' badge with swap icon when in polling mode
- **Transport Mode in websocketStore** — New `transportMode` field (`websocket` | `polling` | `disconnected`)

---

## [Build 51] - 2026-03-08

### Fixed
- **Dictation: No Auto-Select Procedures** — New dictations now start with a clean procedure list instead of auto-selecting from the patient's chief complaint
- **Dictation: Report Header Included** — AI is now instructed to include the intro header line verbatim in the generated operative report
- **Dictation: Edit Scroll Fix** — Fixed scroll behavior in direct-edit mode by disabling inner TextInput scroll and letting the parent ScrollView handle it
- **Dictation: Remove TBD Codes** — CPT/ICD codes not found in the reference library are now omitted entirely instead of showing "TBD" placeholders; missing codes are no longer listed as Open Items

---

## [Build 48] - 2026-03-06

### Added
- **Patient-Linked Operative Report Dictation** — Full dictation workflow tied to individual patients:
  - New `patient-dictation.tsx` modal screen (1900+ lines) with complete OR dictation flow
  - New `patientDictationsStore` — per-patient dictation persistence via AsyncStorage (draft/final status, report history)
  - Auto-populated report header: Dr. Aalami + patient name + MRN + date of operation
  - Date of operation picker
  - Smart procedure pre-selection from patient's chief complaint
  - Per-patient report history timeline
  - Draft auto-save with 10-second debounce
  - Quick duplicate: start new report from previous
  - Export encounter bundle (patient + report + CPT codes)
  - Read-back (TTS), email, and copy support
- **Op Report Button on Patient Cards** — Quick access from patients list with draft indicator badge and "View Report" action

### Fixed
- **Patient Name Layout** — Patient name now renders on its own full-width row on cards (two layout fixes)

---

## [Build 47] - 2026-03-05

### Improved
- **WebSocket Auto-Reconnect** — Robust reconnection system replacing the fragile 3-attempt retry:
  - AppState listener for instant reconnect when app returns to foreground
  - Exponential backoff: 2s → 4s → 8s → 16s → 30s cap, retries indefinitely
  - Ping/pong heartbeat: 25s interval with 10s pong timeout to detect zombie connections
  - Any incoming message clears pong timeout (proves connection alive)
  - Fixes the issue where the app would go "offline" and require a force-restart to recover

### Fixed
- **TypeScript errors** — Fixed `NodeJS.Timeout` type references to `ReturnType<typeof setTimeout>` for React Native compatibility

---

## [Build 46] - 2026-03-04

### Added
- **Crash Logging Service** — New `src/services/crashLog.ts` with AsyncStorage-backed crash log (max 20 entries, FIFO eviction)
- **Global Error Handler** — `ErrorUtils` global handler in `_layout.tsx` catches unhandled JS errors and persists them via crashLog service
- **Auth State Persistence Fix** — Supabase `onAuthStateChange` listener in root layout for reliable session restore after crash
- **Crash Log Viewer** — New "Crash Logs" section in Settings (`explore.tsx`) with View and Clear buttons

---

## [Build 45] - 2026-03-02

### Fixed
- **Cold-Start Hydration Race** (Build 45) — Added a `_hydrated` gate to `settingsStore` that blocks ALL SecureStore writes until Zustand hydration completes, preventing default null state from overwriting real gateway credentials on cold start. Also updated `ConnectionSplash`, `useGateway` hook, and `_layout.tsx` to coordinate around hydration timing.

---

## [Build 43] - 2026-03-01

### Added
- **Operative Report Templates** (Build 40) — Full template system for OR dictation
  - 50+ operative report templates imported from Oliver's prior reports, organized by category (aortic, carotid, peripheral, venous, dialysis access, other)
  - Template loader with smart defaults: auto-selects relevant template based on selected procedures
  - Build-time template compiler (`scripts/build-templates.js`) for optimized loading
  - `src/data/templateContent.ts` and `src/data/templateLoader.ts` for runtime template access
- **Two Edit Modes for Reports** (Build 43) — Dictation review now offers direct text editing AND AI-powered regeneration as separate actions
- **New Dictation Button in Review** (Build 42) — After generating a report, users can start a new dictation without going back

### Changed
- **CPT/ICD-10 Codes: Local Only** (Build 40) — Removed Perplexity web search for CPT/ICD-10 codes; now uses local procedure library exclusively for faster, more reliable code lookup
- **Dictation Bottom Bar Icons** (Build 43) — Updated to match chat tab icons (keypad-outline + image-outline) for visual consistency

### Fixed
- **TTS Auto-Play on App Open** (Build 40) — Fixed stale messages triggering TTS when app opens; now skips auto-play for messages older than the current session
- **API Key Loss on Crash** (Build 40) — settingsStore now guards against losing API keys during crash/rehydration race conditions
- **Upside-Down Empty State** (Build 40) — Fixed inverted empty state display on chat screen
- **Dictation Loading States** (Build 42) — Added proper loading indicators for email sending, TTS readback, and transcription; fixed keyboard scroll behavior; prevented double readback triggers
- **Redundant Empty State Mic** (Build 42) — Removed duplicate microphone icon from dictation empty state

---

## [Build 39] - 2026-02-28

### Added
- **OR Dictation Tab** (Builds #36-39) — New dedicated tab for generating structured operative reports from voice, text, and photo input
  - Tag-based procedure picker (pill/chip UI) organized by category: Aortic, Carotid, Peripheral Arterial, Venous, Dialysis Access, Other
  - Custom procedure tags: add via '+ Add Procedure', long-press to edit/delete, persisted via AsyncStorage
  - CPT/ICD-10 code lookup from local procedure library (web search removed in Build 40)
  - Full report workflow: generate → review → email/copy/read back/edit+regenerate
  - Save reports as examples for future learning context
  - New `dictationStore` (Zustand + AsyncStorage) for custom procedures, corrections, style preferences, saved examples
  - New `dictationService` for report generation via OpenClaw Gateway
  - New `vascularProcedures` data module with categorized procedure library
- **Toast Notification on TTS Failure** (Build #35) — Shows warning toast when ElevenLabs speak() errors out, covering all 4 speak call sites

### Fixed
- **Dictation Recording Startup Errors** (Build #39) — Unload existing recording before starting new, proper iOS audio mode setup with delay
- **Dictation Bottom Bar Clipping** (Builds #38-39) — Increased paddingBottom for tab bar clearance
- **Dictation UI Polish** (Build #38) — Email sent confirmation state, tappable teal mic icon in empty state, removed auto-scroll after transcription
- **Dictation Layout & UX** (Build #37) — ScrollView auto-scroll, Generate Report button repositioned, email sent indicator, verified ElevenLabs voice config
- **Missing expo-clipboard Dependency** — Added to package.json
- **EAS Build Fix** — Upgraded expo-task-manager to 14.0.9

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

### Changed
- **Chat Persistence Moved to AsyncStorage** — `chatStore` now persists transcript history in AsyncStorage instead of SecureStore, with a one-time legacy migration path from the old `echo-chat` SecureStore key

### Fixed
- **Chat Hydration Wipe on Launch** — Added a pre-hydration write lock and queued-message flush in `chatStore` so startup state cannot overwrite stored history with `messages: []`
- **Auth Restore Hardening** — `authStore` and root layout now handle `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, and `SIGNED_OUT` consistently, and manual token writes use `SecureStore.AFTER_FIRST_UNLOCK` for more reliable cold-start session restore
- **Typed Patient Dictation Route Cleanup** — Standardized `/patient-dictation` navigation through typed `Href` usage to avoid Expo Router pathname type failures
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
