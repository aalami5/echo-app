# Build 79 — Fast, resumable operative drafts

## Incident evidence (2026-09-29)

- User's current screenshot reports `Drafting took too long` with `Retry analysis`, not the old ElevenLabs 404. Build 78 used a 330-second client timeout.
- Read-only inspection of latest saved draft: three image inputs; only the first had saved OCR text; no generated report or completed analysis session. This localizes the incomplete workflow to remaining screenshot extraction, before analysis/writing. Exact network/provider failure cannot be reconstructed: legacy requests had no timing logs. Do not claim provider latency or cellular service was definitively the cause.
- Live authenticated catalog reached through the public endpoint in 141 ms. Legacy synthetic angioplasty analysis + writing + audit took 20 seconds, so the phone's multi-minute failure is not reproduced by normal model generation.

## Changes

- Keep the same pinned GPT-5.4 model and source policies, with supported `reasoning_effort: none`. Independent semantic audit and quote/numeric checks remain; no unsupported defaults added. Provider calls have a 45-second bound (previously 150).
- Content-addressed asynchronous jobs acknowledge quickly; encrypted completed results survive HTTP loss and service restart. Identical retries attach to running/completed jobs; failed jobs retry explicitly. Interrupted server jobs are marked failed on recovery, rather than falsely completed. Two-job concurrency cap. Auth and no-store cover submissions, polls and results.
- Client uses short requests with bounded reconnect retries, polls progress, and explains how to reconnect to a still-running job. Reopening with unchanged sources reuses results. Source edits produce a new job. Profile writes are not automatically retried.
- Read up to two screenshots concurrently, retain each successful OCR result immediately, preserve original page order, stop before case analysis if any page is unreadable. Optional saved-example extraction no longer blocks initial case analysis; explicit example selection and approved technique profiles remain available.
- Stage/HTTP timing logs contain no patient content, identifiers, note text, credentials, or URLs with identifiers. Existing reports/receipts are never auto-finalized, modified or emailed by these operations.

## Verification before release

- TypeScript and production iOS export passed. 60 automated tests passed, including lost-response replay, interrupted polling, failure redaction, encrypted result recovery, changed-source isolation, bounded concurrency, multi-page partial recovery, and existing clinical restore/email history regressions.
- Nine synthetic provider cases passed with the direct route and again through jobs. Through-job typed cases: 5.862–12.301 seconds, including analysis, narrative and independent audit, excluding human review. Single screenshot end-to-end: 15.262 seconds. Representative angioplasty: 20 seconds legacy vs 11.273 seconds through jobs. These are small synthetic benchmarks, not a guarantee or validation of every clinical case.
- Source-reference: https://developers.openai.com/api/docs/models/gpt-5.4 (supports none/low/etc.; same pinned snapshot).

## Release / rollback

Deploy patient-sync code and restart only `com.echo.patient-sync`, retaining its environment and encryption key. Build 78 direct endpoints remain supported. Build 79 requires jobs routes; do not roll the server back while new clients are active without communicating service unavailability. Model effort can revert with `OPERATIVE_REASONING_EFFORT=low` while retaining recovery fixes. Preserve encrypted job/source history.

Physical-phone acceptance remains necessary: update in place, retry the saved three-page case, review OCR and the final draft. Do not delete/reinstall; unextracted image bytes remain device-local and are not backed up in clinical sync.
