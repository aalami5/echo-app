# Echo App — Chat Persistence + Auth Restore Hardening

Date: 2026-04-17

## Why this change happened

Oliver reported two linked symptoms:

1. chat history often disappeared after leaving and reopening the app
2. the app sometimes appeared to log out and then log back in with an empty chat

The likely root causes were:

- chat history was being persisted in `expo-secure-store`, which is a poor fit for larger, growing transcript payloads
- the chat store could write `messages: []` before hydration completed, wiping persisted history during startup
- auth restore relied on session rehydration but was not handling `INITIAL_SESSION`, and manual token writes were not using the same hardened accessibility mode everywhere

## Changes made

### 1) Chat persistence moved to AsyncStorage

File:
- `src/stores/chatStore.ts`

Changes:
- moved chat transcript persistence from SecureStore to AsyncStorage
- kept a one-time legacy migration path: if `echo-chat` exists in SecureStore but not AsyncStorage, migrate it forward automatically
- added a pre-hydration write lock so startup store changes cannot overwrite persisted history with an empty array
- added hydration logging:
  - stored message count on hydration
  - legacy migration log
  - blocked-write warning before hydration

Why:
- SecureStore is appropriate for secrets, not transcript history
- AsyncStorage is a safer backend for local chat history and avoids storage-size brittleness
- hydration lock prevents the launch-time wipe bug

### 2) Auth restore hardened

Files:
- `src/stores/authStore.ts`
- `app/_layout.tsx`

Changes:
- standardized manual token writes to use `SecureStore.AFTER_FIRST_UNLOCK`
- made `loadStoredAuth()` log whether a session was found
- ensured auth falls back to a known signed-out state instead of leaving partial state behind
- updated auth listener to handle `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, and `SIGNED_OUT`
- added auth lifecycle logging in `_layout.tsx`

Why:
- auth/session restore becomes more deterministic on cold launch
- avoids pseudo-logged-out states during app startup
- makes it easier to diagnose future auth restore issues from device logs

### 3) TypeScript route cleanup

Files:
- `app/(tabs)/patients.tsx`
- `app/patient-dictation.tsx`

Problem:
- Expo Router typed route generation was not including `/patient-dictation` in `.expo/types/router.d.ts`
- this caused `npx tsc --noEmit` errors anywhere that route was pushed through the router

Changes:
- centralized the patient dictation route into a typed `Href` constant and routed through that constant

Note:
- this is a pragmatic cleanup for the current generated route typing state
- if Expo later regenerates the route list correctly, this helper can remain or be simplified

## Validation

Command run:

```bash
npx tsc --noEmit
```

Expected outcome after these changes:
- chat persistence and auth files should no longer be the source of the previous route/type failures
- patient dictation route calls should no longer fail TypeScript on pathname assignment

## Recommended on-device verification

1. Launch the app
2. Send 2-3 chat messages
3. Background the app
4. Force-close the app
5. Reopen the app
6. Confirm:
   - chat history is still present
   - app remains authenticated

Useful logs to watch:
- `[Chat] Hydration complete with ... stored messages`
- `[Chat] Migrating legacy chat history from SecureStore to AsyncStorage`
- `[Auth] loadStoredAuth session present: ...`
- `[Auth] onAuthStateChange: ...`

## Follow-up ideas

- add a tiny in-app diagnostics screen section showing:
  - chat hydrated yes/no
  - stored message count
  - auth session restored yes/no
- if Expo Router route generation remains flaky, investigate why `/patient-dictation` is excluded from `.expo/types/router.d.ts`
