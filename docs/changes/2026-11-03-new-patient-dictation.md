# Add patient and dictate while archive recovery remains paused

## Scope

Oliver requested another build because he could not add a patient to dictate.
The earlier `7fa77d6` candidate restores only metadata viewing. This successor
adds a usable new-case path while keeping `AUTOMATIC_RECOVERY_PAUSED=true`.
It retains the voice recovery and compact-card changes inherited from `02fa066`.
App identity remains `com.oppersmedical.echo`, 1.0.0; proposed iOS build 104.

Patients → **Add patient & dictate** → name, MRN, operation date and hospital →
the existing patient-linked dictation screen. The header uses the entered date
and Dr. Oliver Aalami. The full procedure catalog, recording, text, photos,
draft generation, direct/AI editing and Read Back remain available. No procedure
is selected automatically and no old report is used as current-case evidence.

**Saved new dictations on this phone** opens the new-case index. Its virtualized
list opens only the selected case. Final reports open read-only. Older patients
remain available in the read-only metadata view; older report links stay paused.
This is not a migration or full restoration of the old clinical archive.

## Persistence and failure handling

- New-case metadata lives under AsyncStorage `echo-new-patient-cases-v1`.
- Each case lives under `echo-new-patient-case-v1-<newcase UUID>`; only one case
  is loaded in the active store. This uses the app's existing AsyncStorage
  mechanism, not a new application-encryption layer.
- Accepted per-case JSON is capped at 8 MiB, with 500 source parts, 200 procedure
  labels, and a bounded 500-case / 2 MiB metadata index. Limit failures are
  explicit; no truncation or deletion is used to make room. Native storage still
  returns an entire single value before accepted-payload validation.
- Writes are serialized with immutable snapshots. Discovery is reserved in the
  index before the first case write. A crash during first save leaves a visible
  unavailable-case entry, not an undiscoverable completed case. Save success is
  displayed only after both case and index writes finish.
- A failed write leaves the in-memory case and last successfully written copy
  intact; Retry save uses the same ID. Switching cases is blocked while the
  current save has failed. Navigation is guarded during recording,
  transcription, generation, unsaved editing, and pending/failed case saving.
- No new-case automatic server backup, sync, migration, restore, resend, or
  finalization email exists. The UI explicitly says the new case is phone-local.
  Existing explicit Email/Copy/Read Back controls are retained. No real patient
  record or email was used as a test fixture.
- Existing patient metadata, reports, removal markers, sync outboxes and
  uncertain-send receipts are not migrated or rewritten by the new repository.
  Its imports of patient/report types are erased at compilation.

## Verification

50 focused tests: new-case repository, actual route/form/recording/draft UI with
synthetic native/service mocks, save failures/retry, direct edits and reopen,
metadata view, legacy add screen, safe-start, draft-first service, report
presentation, audio lease lifecycle and existing voice recovery. TypeScript and
`git diff --check` pass. Source tests do not prove microphone/network behavior on
a physical iPhone; mocked transcription/generation are not live model tests.

Local iOS Metro export must include these UTF-8/UTF-16LE markers:
`Add patient & dictate`, `Saved new dictations on this phone`, `Start dictation`,
`echo-new-patient-case-v1-`, `Generate draft`, `Retry save`, `Read Back`, and
`Reset connection`. For shared dependencies follow the temporary resolver
harness documented in `patient-list-read-only-recovery.md`; do not upload an
absolute local resolver override. The tested harness is removed after export.

## Release and device acceptance

At 2026-11-03 22:38 UTC, EAS latest is finished build103
`6229e978-680e-4e7a-99fa-00da31d79cb8`; Apple latest is build103, `VALID`,
`9af8220b-93ab-4a61-9df6-81eca9c897b7`. No build104 is established by that read.
Reconcile any new release receipt before starting a second job. Source/bundle
verification is separate from native compilation, signed IPA inspection,
TestFlight submission and Apple's internal tester availability.

Update Echo **in place**, never uninstall or clear storage. Phone acceptance:
add a synthetic patient/date; record and stop; confirm transcript; generate;
direct edit and save; close/reopen; verify date/name/MRN association and exact
saved edit; then test airplane mode, foreground/background, larger photo cases,
and memory pressure. Check older list visibility and archive remains paused.
Native microphone, interrupted transcription, app-kill durability, actual
storage capacity, server drafting and clinical correctness remain device/live
acceptance checks, not claims from a mocked renderer test.
