# State Management

> Zustand Stores Reference

**Last Updated:** February 7, 2026 (evening)

---

## Overview

Echo App uses [Zustand](https://github.com/pmndrs/zustand) for state management with the `persist` middleware for durable storage via `expo-secure-store`.

All persisted stores use iOS Keychain encryption.

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

---

### authStore

Manages authentication state (minimal, for future use).

**File:** `src/stores/authStore.ts`

**State:**

| Field | Type | Persisted | Description |
|-------|------|-----------|-------------|
| `user` | `User \| null` | ❌ | Current user |
| `accessToken` | `string \| null` | ❌ | JWT token |
| `isAuthenticated` | `boolean` | ❌ | Auth status |
| `isLoading` | `boolean` | ❌ | Loading state |

**Note:** Auth is currently bypassed (app is single-user).

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

**Note:** Events are fetched on-demand and not persisted.

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
1. Zustand's persist middleware reads from SecureStore
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
