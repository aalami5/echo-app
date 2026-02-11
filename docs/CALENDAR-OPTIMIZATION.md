# Calendar Sync Optimization Research

**Issue:** App startup blocked during calendar sync (can take minutes). User can't chat until calendar finishes.

**Root Cause:** Calendar data is fetched fresh from Gateway on every app start with no local persistence.

---

## Current Flow (BLOCKING)

```
App Start → Load Settings → Fetch Calendar (WAITS) → Show Chat UI
                              ↓
                    Gateway → gog calendar → Google API
                         (2-30+ seconds)
```

**Problems:**
1. Zustand store resets on app restart (no persistence)
2. Calendar fetch blocks entire app initialization
3. Gateway roundtrip adds latency
4. No offline capability

---

## Recommended Solution: Stale-While-Revalidate

### New Flow (NON-BLOCKING)

```
App Start → Load Cached Calendar → Show Chat UI (IMMEDIATE)
                                        ↓
                            Background: Fetch Fresh Calendar
                                        ↓
                              Update UI when ready
```

### Implementation

**1. Add Calendar Persistence (MMKV or AsyncStorage)**

```typescript
// calendarStore.ts - Add persistence
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useCalendarStore = create<CalendarStore>()(
  persist(
    (set) => ({
      events: [],
      isLoading: false,
      lastFetched: null,
      // ... existing methods
    }),
    {
      name: 'calendar-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Serialize dates properly
      serialize: (state) => JSON.stringify(state, (key, value) => {
        if (value instanceof Date) return { __date: value.toISOString() };
        return value;
      }),
      deserialize: (str) => JSON.parse(str, (key, value) => {
        if (value && value.__date) return new Date(value.__date);
        return value;
      }),
    }
  )
);
```

**2. Non-Blocking Refresh Hook**

```typescript
// useCalendar.ts - Don't block on mount
useEffect(() => {
  // Show cached data immediately (handled by persist)
  
  // Then refresh in background if stale (>5 min or empty)
  if (gatewayUrl && gatewayToken) {
    const isStale = !lastFetched || 
      (Date.now() - lastFetched.getTime() > 5 * 60 * 1000);
    
    if (isStale) {
      // Background refresh - don't await, don't block
      refresh().catch(console.error);
    }
  }
}, [gatewayUrl, gatewayToken]);
```

**3. Dedicated Calendar Endpoint (Optional, Better Performance)**

Instead of going through chat completions, add a direct endpoint to the Echo server:

```javascript
// server/index.js
app.get('/calendar/today', async (req, res) => {
  const { execSync } = require('child_process');
  const result = execSync('gog calendar events primary --today --json', { 
    timeout: 30000 
  });
  res.json(JSON.parse(result.toString()));
});
```

Benefits:
- Faster (no LLM roundtrip)
- More reliable (no prompt parsing issues)
- Can add caching at server level

---

## Additional Optimizations

### 1. Prefetch on App Background

When app goes to background, schedule a refresh for when it comes back:

```typescript
import { AppState } from 'react-native';

useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      // App came to foreground - refresh if stale
      refreshIfStale();
    }
  });
  return () => subscription.remove();
}, []);
```

### 2. Smart Refresh Intervals

- First 5 minutes of day: Refresh more frequently (meetings starting soon)
- During meetings: No refresh needed
- Evening: Less frequent

### 3. Incremental Sync

Instead of fetching all events, use `syncToken` from Google Calendar API for delta updates.

---

## Estimated Impact

| Metric | Before | After |
|--------|--------|-------|
| Time to chat | 5-30 sec | <1 sec |
| Offline capability | ❌ | ✅ (cached) |
| Data freshness | Always fresh | 5 min max stale |
| User experience | Frustrating | Smooth |

---

## Implementation Priority

1. **HIGH** - Add persistence to calendarStore (MMKV/AsyncStorage)
2. **HIGH** - Make refresh non-blocking on mount
3. **MEDIUM** - Add dedicated /calendar endpoint to server
4. **LOW** - Smart refresh intervals
5. **LOW** - Incremental sync with syncToken

---

## Build #5 Scope

Minimum viable:
- ✅ Persist calendar to device storage
- ✅ Show cached data immediately on launch
- ✅ Background refresh (non-blocking)
- ✅ Visual indicator when refreshing

*Document created: Feb 11, 2026*
