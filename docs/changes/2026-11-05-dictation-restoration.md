# Restore the original patient-linked dictation view — build 106

## Reference and scope

User requested the build-100 dictation experience, not the minimal date-entry sheet.
GitHub `aalami5/echo-app`, `fix/voice-session-cleanup-20261024`, revision
`0a062714355ec33f55f559d9b0395da1ef17a896` contains original dictation blob
`4e1472148afe439413080c4f4da18208f1b919a8`. Its file matches the local source.
Build-100 release commit `188d0991872b1985140f8ffd7151fe4496f42eff` only added the
safe-start wrapper to that screen. That release commit is local, not on GitHub.
The entire original `StyleSheet` is unchanged. Based on build105 `c9467e8` so
newer patient list, audio and durable-save fixes are retained.

## Restored behavior

- Patient list → Op Report immediately opens the original full dictation screen.
  Removed the intervening date-only page shown in the user's screenshot.
- Patient identity/header, native calendar, transcript/source cards, procedure
  groups/custom procedures, microphone/avatar, typed notes and photo input.
- Draft-first generation; direct and AI edits; Read Back/play/pause/resume;
  Copy, Export Encounter, Save as Example, explicit Email and Finalize Report.
- New Report stays attached to the same patient. Start Fresh and Start from
  Previous retain the current patient header; prior text is historical reference,
  never asserted as current-case facts. A new operation date is not copied.
- Undated drafts can be captured and saved immediately. Select the operation date
  in the original calendar before generating a report; no implicit date default.
- Compact local save indicator inside the original screen rather than a second
  safe-area wrapper. Retry save and exit protections remain.
- Scoped new-case receipt refresh reconciles prior sends without loading or
  migrating the old report archive. No automatic sends or uncertain-send replay.

## Verification

45 focused source/component/storage tests pass; TypeScript and diff checks pass.
Tests exercise real screen handlers with synthetic data and mocked native/network
services. They cover recording/transcription, typed/photo input, date selection,
custom procedure, draft, AI/direct edits, readback controls, copy/export, examples,
explicit email, finalization, fresh/reference new reports, selective reopen and
failed-save recovery. Tests do not send any real patient email.

Native iOS compilation, signed-package verification and Apple TestFlight checks
are release gates, recorded separately. Physical-device acceptance remains pending.

## Preservation and limitations

Update in place; never uninstall. New cases stay in the bounded per-case local
repository. The original large patient/report archive remains preserved but
unavailable; this screen restoration is not an archive migration or backup rollout.
Existing original report data, settings, audio protections and send receipts are
not deleted. Server backup of new cases is unchanged (not enabled).
