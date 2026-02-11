# Network Status & Connectivity UI — Build #5 Spec

## Overview
Improve user visibility into connection status, message delivery, and network health. Goal: Oliver should always know what's happening and why.

---

## Feature 1: Connection Quality Indicator

### What
Replace binary online/offline with a 3-tier signal strength indicator.

### UI
- 🟢 **Strong** — latency <200ms, stable WebSocket
- 🟡 **Weak** — latency 200-500ms or recent reconnects
- 🔴 **Offline** — no connection

### Location
Top-right of chat screen, near existing status indicator.

### Implementation
- Track WebSocket ping/pong latency
- Track API response times (rolling average)
- Track reconnection frequency (>2 in 30 sec = weak)

### Files to modify
- `src/lib/websocket.ts` — add latency tracking
- `src/stores/websocketStore.ts` — add connectionQuality state
- `src/components/ConnectionIndicator.tsx` — new component

---

## Feature 2: Message Status Indicators

### What
Show delivery state for each sent message.

### States
- ⏳ **Sending** — message in flight
- ✓ **Sent** — server acknowledged receipt
- ✓✓ **Delivered** — (future: when Echo responds)
- ⚠️ **Failed** — tap to retry

### UI
Small icon/text below each user message bubble.

### Implementation
- Add `status` field to message objects in chatStore
- Track pending messages in a queue
- Update status on WebSocket ack or timeout
- Add retry handler for failed messages

### Files to modify
- `src/stores/chatStore.ts` — add message status tracking
- `src/components/ChatMessage.tsx` — render status indicator
- `src/lib/websocket.ts` — emit ack events

---

## Feature 3: Toast Notifications

### What
Brief, auto-dismissing notifications for transient events.

### Events to show
- "Reconnecting..." (when WebSocket drops)
- "Back online" (when connection restored)
- "Message failed to send" (with retry action)
- "Voice recording saved" (confirmation)
- "Slow connection detected" (when quality drops to weak)

### UI
- Slides up from bottom, above input area
- Auto-dismiss after 3 seconds (or on tap)
- Queue multiple toasts (don't overlap)
- Support action buttons (e.g., "Retry")

### Implementation
- Create ToastProvider context
- Create Toast component with animations
- Create useToast hook for triggering from anywhere
- Integrate with WebSocket events

### Files to create
- `src/components/Toast.tsx`
- `src/components/ToastProvider.tsx`
- `src/hooks/useToast.ts`

### Files to modify
- `app/_layout.tsx` — wrap with ToastProvider

---

## Feature 4: Last Synced Timestamp

### What
Show when data was last successfully synced.

### UI
Small text in header or settings: "Last synced: 2 min ago"

If stale (>60 sec), show warning color.

### Implementation
- Track lastSyncTime in relevant stores
- Create LastSynced component with relative time display
- Update on successful API calls

### Files to modify
- `src/stores/chatStore.ts` or new `syncStore.ts`
- Create `src/components/LastSynced.tsx`

---

## Feature 5: Network Diagnostics Screen

### What
Settings page with detailed network info for debugging.

### Info to display
- Current connection status (connected/reconnecting/offline)
- WebSocket latency (current + average)
- Last successful ping timestamp
- Reconnection count (session)
- Recent errors (last 10, with timestamps)
- Gateway URL and connection info
- Device network type (WiFi/cellular)

### UI
Settings → Network Status

### Implementation
- Create diagnostics store to collect metrics
- Create NetworkDiagnostics screen
- Add to settings navigation

### Files to create
- `src/stores/diagnosticsStore.ts`
- `app/settings/network.tsx` (or similar)

---

## Feature 6: Voice Quality Indicator

### What
During voice recording/playback, show audio quality status.

### States
- 🎤 Recording... (with level meter)
- ⏳ Processing...
- 🔊 Playing...
- ⚠️ Poor connection — voice may be delayed

### Implementation
- Track audio buffer health
- Show warning when TTS is buffering
- Visual feedback for mic input levels

### Files to modify
- `src/hooks/useVoiceChat.ts`
- `src/components/Avatar.tsx` — add quality indicator

---

## Priority Order

1. **Toast notifications** — Foundation for other status messages
2. **Connection quality indicator** — Replace current binary indicator
3. **Message status indicators** — Critical for knowing if messages sent
4. **Last synced timestamp** — Quick glance reliability check
5. **Voice quality indicator** — Important for voice-first UX
6. **Network diagnostics screen** — Power user feature, lower priority

---

## Build Plan

### Build #5a (Core)
- Toast system
- Connection quality indicator
- Message status indicators

### Build #5b (Polish)
- Last synced timestamp
- Voice quality indicator
- Network diagnostics screen

---

## Dependencies

- `react-native-reanimated` — already installed, use for toast animations
- Consider `expo-network` — for detecting WiFi vs cellular

---

## Success Criteria

Oliver should be able to:
1. Glance at the screen and know connection quality instantly
2. Know if a message was sent or failed
3. Understand why the app might be slow
4. Never wonder "did that go through?"

---

*Created: 2026-02-10*
*Target: Build #5 (after notifications stable)*
