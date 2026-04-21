# State Management

> Zustand Stores Reference

**Last Updated:** April 20, 2026

---

## Overview

Echo App uses [Zustand](https://github.com/pmndrs/zustand) for state management with the `persist` middleware.

Persisted state is split across:
- **AsyncStorage** for larger non-secret local data like chat transcripts and dictation state
- **expo-secure-store** for secrets and sensitive patient/settings data that should live in iOS Keychain

---

## Stores

### chatStore

Manages conversation history with Echo.

**File:** `src/stores/chatStore.ts`

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `messages` | `Message[]` | ✅ | Chat history (max 100) |
| `isConnected` | `boolean` | ❌ | Gateway connection status |
| `avatarState` | `AvatarState` | ❌ | Current avatar animation state |
| `hasHydrated` | `boolean` | ❌ | Whether local transcript hydration is complete |

**Hydration Safety:** `chatStore` now persists transcripts in AsyncStorage and uses a pre-hydration write lock plus queued-message replay during `onRehydrateStorage`. If legacy chat history exists in SecureStore under `echo-chat`, it is migrated forward once, then removed from SecureStore.

**Actions:**

```typescript
addMessage(message: Message): void
updateMessage(id: string, updates: Partial<Message>): void
setAvatarState(state: AvatarState): void
setConnected(connected: boolean): void
clearMessages(): void
```

**Usage:**

```typescript
import { useChatStore } from '../stores/chatStore';

function ChatScreen() {
  const { messages, addMessage, avatarState } = useChatStore();
  
  const handleSend = (text: string) => {
    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    });
  };
}
```

**Persistence Details:**
- Key: `echo-chat`
- Storage backend: AsyncStorage
- Legacy migration: reads old SecureStore value once and moves it to AsyncStorage automatically
- Max messages: 100 (auto-trims oldest)
- Only `messages` array is persisted

---

### patientsStore

Manages on-call patient tracking.

**File:** `src/stores/patientsStore.ts`

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `patients` | `Record<string, Patient>` | ✅ | All patients indexed by ID |
| `callDays` | `Record<string, CallDay>` | ✅ | Call days indexed by ID |
| `callDayOrder` | `string[]` | ✅ | Ordered call day IDs |
| `searchQuery` | `string` | ❌ | Current search filter |
| `activeCallDayId` | `string \| null` | ❌ | Selected call day |
| `pendingPatient` | `Patient \| null` | ❌ | Patient awaiting confirmation |

**Actions:**

```typescript
// Patient management
addPatient(patient: PatientInput, callDayId?: string): string
updatePatient(id: string, updates: Partial<Patient>): void
deletePatient(id: string): void
setPendingPatient(patient: PatientInput | null): void
clearPendingPatient(): void

// Call day management
createCallDay(date?: Date): string
deleteCallDay(id: string): void
setActiveCallDay(id: string | null): void

// Search
setSearchQuery(query: string): void
searchPatients(query: string): Patient[]

// Getters
getPatientsByCallDay(callDayId: string): Patient[]
getPatientsByHospital(callDayId: string, hospital: Hospital): Patient[]
getTodayCallDay(): CallDay | null
getRecentComplaints(limit?: number): string[]
getCommonComplaints(): string[]

// Export
exportToCSV(): string
```

**Types:**

```typescript
type Hospital = 'SEQ' | 'ECH' | 'SMCMC' | 'Mills' | 'OTHER';

interface Patient {
  id: string;
  name: string;
  mrn: string;
  dob: string;
  room: string;
  hospital: Hospital;
  chiefComplaint: string;
  timeSeen: string;      // ISO timestamp
  callDayId: string;
}

interface CallDay {
  id: string;
  date: string;          // YYYY-MM-DD
  displayDate: string;   // "Feb 6, 2026"
  dayOfWeek: string;     // "Thursday"
  patientIds: string[];
}
```

**Persistence Details:**
- Key: `echo-patients`
- Auto-deduplicates call days on hydration
- Merges patients when duplicate dates detected

---

### settingsStore

Manages app configuration and API keys.

**File:** `src/stores/settingsStore.ts`

**State:**

| Field | Type | Persisted | Default |
|-------|------|-----------|---------|
| `openaiApiKey` | `string \| null` | ✅ | `null` |
| `elevenlabsApiKey` | `string \| null` | ✅ | `null` |
| `voiceName` | `VoiceName` | ✅ | `'river'` |
| `voiceEnabled` | `boolean` | ✅ | `true` |
| `autoPlayResponses` | `boolean` | ✅ | `true` |
| `hapticFeedback` | `boolean` | ✅ | `true` |
| `textScale` | `TextScale` | ✅ | `'normal'` |
| `gatewayUrl` | `string` | ✅ | env default |
| `gatewayToken` | `string \| null` | ✅ | `null` |

**Types:**

```typescript
type TextScale = 'normal' | 'large' | 'xlarge';
```

**Actions:**

```typescript
setOpenAIKey(key: string | null): void
setElevenLabsKey(key: string | null): void
setVoiceName(voice: VoiceName): void
setVoiceEnabled(enabled: boolean): void
setAutoPlayResponses(enabled: boolean): void
setHapticFeedback(enabled: boolean): void
setTextScale(scale: TextScale): void
setGatewayUrl(url: string): void
setGatewayToken(token: string | null): void
clearAllKeys(): void
```

**Persistence Details:**
- Key: `echo-settings`
- All fields persisted
- **Crash Guard (Build 40):** Rehydration logic validates that API keys aren't overwritten with `null` from a stale/corrupt state snapshot
- **Hydration Gate (Build 45):** Module-level `_hydrated` flag blocks ALL SecureStore writes until `onRehydrateStorage` fires, preventing Zustand's default null state from overwriting real credentials during cold start
- **Gateway Bootstrap (Build 55):** Hardcoded obfuscated token removed; gateway URL and token now fetched from Supabase RPC via `gatewayBootstrap` service after authentication. `ensureGatewayConfig()` called from app layout after auth + hydration.
- **API Key Bootstrap (Build 59):** OpenAI and ElevenLabs keys restored from Supabase RPC if currently empty (never overwrites user-set keys)
- **Credential Hardening (Build 54):** Keychain accessibility changed to `AFTER_FIRST_UNLOCK`; XOR-obfuscated fallback for gateway token survives SecureStore loss after reboot

---

### authStore

Manages authentication state (minimal, for future use).

**File:** `src/stores/authStore.ts`

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `user` | `User \| null` | ❌ | Current user |
| `accessToken` | `string \| null` | ❌ | JWT access token |
| `refreshToken` | `string \| null` | ❌ | JWT refresh token |
| `isAuthenticated` | `boolean` | ❌ | Auth status |
| `isLoading` | `boolean` | ❌ | Loading state |

**Auth Restore Notes (Apr 17):**
- `loadStoredAuth()` now logs whether a Supabase session was found and always resolves to a fully signed-in or signed-out state
- Manual token writes use `SecureStore.AFTER_FIRST_UNLOCK` for more reliable cold-start restoration
- Root layout listens for `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, and `SIGNED_OUT` so auth state does not get stranded in a partial startup state

---

### networkStore

Manages network connection state and toast notifications.

**File:** `src/stores/networkStore.ts`

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `isConnected` | `boolean` | ❌ | Gateway connection status |
| `connectionQuality` | `'good' \| 'fair' \| 'poor'` | ❌ | Signal strength tier |
| `toasts` | `Toast[]` | ❌ | Active toast notifications |

**Actions:**

```typescript
setConnected(connected: boolean): void
setConnectionQuality(quality: 'good' | 'fair' | 'poor'): void
addToast(toast: Omit<Toast, 'id'>): string
removeToast(id: string): void
clearToasts(): void
```

**Types:**

```typescript
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;  // Auto-dismiss in ms
}
```

**Usage:**

```typescript
import { useNetworkStore } from '../stores/networkStore';

function Component() {
  const { isConnected, addToast } = useNetworkStore();
  
  const handleError = () => {
    addToast({
      type: 'error',
      message: 'Failed to send message',
      duration: 3000,
    });
  };
}
```

**Note:** Not persisted — connection state is re-established on app launch.

---

### connectionStore

Manages gateway connection state for app launch flow.

**File:** `src/stores/connectionStore.ts`

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `state` | `ConnectionState` | ❌ | `'initializing'` \| `'connecting'` \| `'connected'` \| `'failed'` |
| `error` | `string \| null` | ❌ | Error message if failed |
| `minSplashTimeMs` | `number` | ❌ | Minimum splash display time (1500ms) |
| `splashShownAt` | `number \| null` | ❌ | Timestamp when splash was shown |
| `pendingNotifications` | `PendingNotification[]` | ❌ | Notifications queued during connection |

**Actions:**

```typescript
setState(state: ConnectionState, error?: string): void
markSplashShown(): void
canDismissSplash(): boolean
queueNotification(notification: PendingNotification): void
drainNotifications(): PendingNotification[]
clearNotifications(): void
```

**Types:**

```typescript
type ConnectionState = 'initializing' | 'connecting' | 'connected' | 'failed';

interface PendingNotification {
  id: string;
  type: 'message' | 'meeting' | 'brief';
  content?: string;
  timestamp: string;
  eventId?: string;
}
```

**Note:** As of Build 23, the splash screen is removed, but this store still tracks connection state for notification queueing.

---

### websocketStore

Tracks WebSocket/transport connection state and current transport mode.

**File:** `src/stores/websocketStore.ts`

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `isConnected` | `boolean` | ❌ | Whether any transport is connected |
| `isConnecting` | `boolean` | ❌ | Whether a connection attempt is in progress |
| `lastMessageTime` | `Date \| null` | ❌ | Timestamp of last received message |
| `error` | `string \| null` | ❌ | Last connection error |
| `transportMode` | `TransportMode` | ❌ | Current transport: `'websocket'` \| `'polling'` \| `'disconnected'` |

**Actions:**

```typescript
setConnected(connected: boolean): void
setConnecting(connecting: boolean): void
setLastMessageTime(time: Date): void
setError(error: string | null): void
setTransportMode(mode: TransportMode): void
reset(): void
```

**Transport Mode (Build 52):** The `transportMode` field is set by the transport manager (`src/lib/transport.ts`). It starts as `'disconnected'`, moves to `'websocket'` on successful WS connection, and falls back to `'polling'` after 3 WS failures in 60s. The `NetworkIndicator` component uses this to show a yellow "Limited" badge in polling mode.

**Note:** Not persisted — transport state is re-established on app launch.

---

### calendarStore

Caches calendar events fetched from Google Calendar.

**File:** `src/stores/calendarStore.ts`

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `events` | `CalendarEvent[]` | ❌ | Cached events |
| `isLoading` | `boolean` | ❌ | Fetch status |
| `lastFetch` | `number \| null` | ❌ | Last refresh timestamp |

**Note:** Events are fetched on-demand and not persisted. On rehydration, if the cache is from a different day, events are cleared and a fresh fetch is triggered to prevent stale/ghost events.

---

### dictationStore

Manages OR dictation sessions and persisted learning data.

**File:** `src/stores/dictationStore.ts`

**Persistence:** AsyncStorage (not SecureStore — non-sensitive data)

**Persisted State:**

| Field | Type | Description |
|-------|------|-------------|
| `corrections` | `CorrectionEntry[]` | Learned corrections for report generation |
| `stylePreferences` | `StylePreference[]` | Section-level style preferences |
| `savedExamples` | `SavedExample[]` | Saved reports as future learning context |
| `customProcedures` | `CustomProcedure[]` | User-added procedure tags |

**Session State (not persisted):**

| Field | Type | Description |
|-------|------|-------------|
| `transcriptParts` | `TranscriptPart[]` | Current session transcript (voice/text/image) |
| `generatedReport` | `string \| null` | Generated operative report |
| `isGenerating` | `boolean` | Report generation in progress |
| `selectedProcedures` | `string[]` | Selected procedure tags for current session |

**Key Actions:** `addTranscriptPart`, `toggleProcedure`, `setGeneratedReport`, `saveAsExample`, `addCustomProcedure`, `addCorrection`, `clearSession`

---

### patientDictationsStore

Manages per-patient operative report dictations with draft/final lifecycle.

**File:** `src/stores/patientDictationsStore.ts`

**Persistence:** AsyncStorage (key: `patient-dictations`)

**Sync Behavior (Apr 20):** Any time a finalized dictation is created, updated, or deleted, the store calls `syncFinalizedDictations()` from `src/services/dictationSync.ts`. Only dictations with `status: 'final'` are sent to the Mac mini sync server. Sync is best-effort with an in-memory pending payload, single-flight protection, transcript-part sanitization, and up to 3 retries.

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `dictations` | `Record<string, PatientDictation>` | ✅ | All dictations keyed by ID |

**PatientDictation Shape:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID |
| `patientId` | `string` | Links to `Patient.id` |
| `status` | `'draft' \| 'final'` | Draft = in-progress, Final = completed |
| `dateOfOperation` | `string` | ISO date string |
| `transcriptParts` | `TranscriptPart[]` | Voice/text/image inputs (reuses dictationStore types) |
| `selectedProcedures` | `string[]` | Selected procedure tags |
| `generatedReport` | `string \| null` | AI-generated operative report |
| `createdAt` / `updatedAt` | `string` | ISO timestamps |

**Actions:** `createDictation(patientId)` → returns new ID, `updateDictation(id, updates)`, `deleteDictation(id)`, `finalizeDictation(id)`

**Notes:**
- `updateDictation()` triggers sync if the dictation was already final or is being transitioned to final
- `deleteDictation()` re-syncs only when removing a finalized dictation, so the server copy stays in step
- `finalizeDictation()` always syncs immediately after flipping status to `final`
- Sync payloads include only finalized dictations and only the transcript-part fields needed downstream (`id`, `type`, `content`, `timestamp`)

**Helpers:** `getDictationsForPatient(patientId)` — returns all dictations for a patient, sorted by date. `buildPatientDictationHeader(name, mrn, date)` — generates report header. `formatPatientDictationDate(iso)` — display-friendly date.

---

## Persistence Layer

### SecureStorage Adapter

All persisted stores use a common adapter:

```typescript
const secureStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (e) {
      console.log('[Store] SecureStore get error:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (e) {
      console.log('[Store] SecureStore set error:', e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (e) {
      console.log('[Store] SecureStore remove error:', e);
    }
  },
};
```

### Storage Keys

| Store | Key | Size Limit |
|-------|-----|------------|
| Chat | `echo-chat` | ~100 messages |
| Patients | `echo-patients` | No hard limit |
| Settings | `echo-settings` | Small |

### Rehydration

On app startup:
1. Zustand's persist middleware reads from AsyncStorage or SecureStore, depending on the store
2. State is hydrated before first render
3. `onRehydrateStorage` callback cleans up data if needed

---

## Best Practices

### Accessing State

```typescript
// ✅ Inside components - use hook
const { messages } = useChatStore();

// ✅ Outside components - use getState()
const messages = useChatStore.getState().messages;

// ✅ Subscribe to changes outside React
const unsub = useChatStore.subscribe(
  (state) => state.isConnected,
  (connected) => console.log('Connection:', connected)
);
```

### Updating State

```typescript
// ✅ Use actions
addMessage(newMessage);

// ✅ For complex updates
set((state) => ({
  messages: [...state.messages, newMessage].slice(-100),
}));

// ❌ Don't mutate directly
state.messages.push(newMessage); // BAD
```

### Performance

```typescript
// ✅ Select only what you need
const avatarState = useChatStore((s) => s.avatarState);

// ❌ Don't select entire state if you only need one field
const { avatarState } = useChatStore(); // Re-renders on ANY state change
```
f needed

---

## Best Practices

### Accessing State

```typescript
// ✅ Inside components - use hook
const { messages } = useChatStore();

// ✅ Outside components - use getState()
const messages = useChatStore.getState().messages;

// ✅ Subscribe to changes outside React
const unsub = useChatStore.subscribe(
  (state) => state.isConnected,
  (connected) => console.log('Connection:', connected)
);
```

### Updating State

```typescript
// ✅ Use actions
addMessage(newMessage);

// ✅ For complex updates
set((state) => ({
  messages: [...state.messages, newMessage].slice(-100),
}));

// ❌ Don't mutate directly
state.messages.push(newMessage); // BAD
```

### Performance

```typescript
// ✅ Select only what you need
const avatarState = useChatStore((s) => s.avatarState);

// ❌ Don't select entire state if you only need one field
const { avatarState } = useChatStore(); // Re-renders on ANY state change
```
