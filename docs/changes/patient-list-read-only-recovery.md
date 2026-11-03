# Safe-start patient-list recovery

The Patients route now mounts `ReadOnlyPatientsScreen` while
`AUTOMATIC_RECOVERY_PAUSED` remains true. The historical editing screen lives in
`src/screens/LegacyPatientsScreen.tsx` and is not evaluated by that branch.
The existing voice/card changes from base `02fa066` are retained.

## Data preservation

- Read `echo-patients` directly from SecureStore without hydrating the persistent
  patient store. No writes, migrations, maintenance, restore, export, send, or
  delete operations are exposed by the read-only view.
- Independently GET `/patients/list` with the existing configured token over
  HTTPS and `Cache-Control: no-store`. The existing authenticated server route
  returns only patient metadata and already sets a no-store response header.
- A transient overlay preserves phone edits for matching IDs and applies phone
  removal markers. It never saves the combined list. Each row identifies its
  source. If the phone read fails or is absent, server-only results are explicitly
  labeled as unverified against the phone's edits/removals. Failed sources are
  never shown as successful empty lists.
- Dictation/report archives, uncertain-send receipts and outboxes are neither
  read nor replayed. The persistent patient store now skips hydration and guards
  mutation/persistence while recovery is paused. Patient sync also refuses work
  while paused.

## Resource bounds and display

The service checks a 2 MiB UTF-8 payload limit before JSON parsing, 5,000
patients, 5,000 call days and 5,000 removal markers per source. It checks the
combined patient count too. Limits fail the view explicitly, never silently
truncate it. These are deliberately conservative relative to the earlier
verified ~195 KB encrypted server metadata file; they are not a phone-memory
measurement. Individual displayed strings are also limited to 8,192 characters.

Native XHR download progress and announced Content-Length abort oversized
responses where available, with an independent actual-byte check at completion.
These checks bound accepted/parsed data, not an absolute native transport memory
ceiling: RN can buffer between progress events, and SecureStore returns a whole
value before its size can be checked. No dictation data is read to work around
this limitation.

Local reads time out after 5 seconds, server requests after 15 seconds. Refresh
cancels previous network requests and ignores late SecureStore completions.
Blur, backgrounding, credential changes and unmount invalidate the reader and
clear the rendered metadata. Return to the foreground/focused tab reloads it.
The screen uses SectionList with bounded render batches, search and call-day /
hospital grouping. It does not invent report counts or offer report actions.

## Local checks

Run:

```
node --test tests/read-only-patients.test.cjs tests/read-only-patients-ui.test.cjs tests/safe-start.test.cjs tests/add-patient-ui.test.cjs
./node_modules/.bin/tsc --noEmit
CI=1 EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 ./node_modules/.bin/expo export --platform ios --output-dir <local-output>
```

For a worktree with symlinked dependencies, Metro also needs the real dependency
directory in `watchFolders` and `resolver.nodeModulesPaths`. A temporary local
resolver harness was used for this verification and removed afterward. Use
`--clear` when switching worktrees: a cached router context can otherwise produce
a superficially successful bundle without the app routes. Verify the resulting
bundle actually contains both the read-only screen and existing Live Voice UI.

Synthetic tests cover local-only/server-only/empty/failure states, edits and
removals, duplicates by ID, schema and size rejection, authenticated read-only
requests, stale refresh/unmount, local timeout, source labeling, search,
background/foreground behavior, protected-store preservation and paused sync.
The historical add-patient test explicitly mounts the legacy screen with recovery
enabled only in its test fixture; it does not enable editing in the actual app.

## Release acceptance still required

This is source and local-bundle verification, not a restored phone or signed IPA.
Before release, review the exact local revision, reconcile current EAS/Apple
receipts and select a build number. Private-source upload to Expo and internal
TestFlight distribution require the owner's release approval. Nothing here
changes release settings or initiates a cloud build.

After a signed repair build is available, update Echo **in place** and verify:

1. Patient list appears; compare phone/server status and expected known patients.
2. Search, long-list scrolling and large text work without report hydration.
3. Refresh, airplane mode, expired authentication and foreground/background do
   not falsely show successful empty data or lose unsaved phone records.
4. Force close/restart and measure memory under pressure on the affected device.
5. Confirm editing/report/dictation recovery remains paused, retained storage is
   unchanged, and no sync or sends occurred.

Do not uninstall Echo, clear storage, downgrade to force hydration, or claim
phone verification from the server audit. The prior audit validated server
structure/linkage and unchanged hashes; it did not validate clinical correctness,
phone data, audio availability or an independent off-host backup.
