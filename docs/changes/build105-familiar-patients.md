# Build 105 — restore the familiar Patients view

Oliver urgently requested the original patient UI and supplied the September 19
photo as the visual reference. Restore the date/hospital groups, original card
styling, room badges, search/share, floating +, Add/Edit Patient sheet, complaint
quick picks/voice and scanning. Save returns to the patient card; Op Report then
opens a report after an explicit operation date. Current-case drafting, direct
and AI edits, photos and Read Back are unchanged.

## Data path

- `FamiliarPatientsScreen` is the actual safe-start route. It uses the exact
  preserved patient styles, with a flat virtualized list to bound mounted rows.
- Existing metadata still uses the bounded read-only phone/server overlay;
  original `echo-patients` and all report archives/outboxes/receipts are untouched.
- New patients and phone-local edits live in `echo-patient-view-v1` (2 MiB/5,000
  metadata records). Writes serialize, validate before writing, preserve retry
  identity, and do not create a dictation when adding a patient. A failed save
  keeps the form and the last saved copy. No delete/migration/sync is enabled.
- New reports use the existing per-case repository with the selected patient ID.
  Only the opened report loads. The summary optionally includes hospital/room/
  complaint metadata and a content flag; the full updated index size is checked
  before any case write. Build104 summaries remain readable without rewriting
  or loading all their cases. Unknown hospital remains explicitly unknown; the
  selected case's metadata can enrich the view in memory after it is opened.
- Patient edits do not rewrite previously saved report snapshots. Report picker
  shows report-specific names/MRNs/dates. Older archive reports remain unavailable;
  no invented report counts, statuses or email receipts are shown for them.
- New patients, edits and reports remain phone-local; no backend deployment or
  automatic send is part of this restoration. Share is an explicit user action.

## Verification and limits

Synthetic tests exercise add/save/retry/reopen, no report on add, scan-to-form,
correct operation date and patient linkage, draft/final routing, date collapse,
search, source failures, background clearing, metadata bounds, protected-key
preservation, isolated report persistence and existing draft/voice flows.
TypeScript and iOS Metro export are separate from native compilation and signed
package checks. Evidence is in workspace `data/echo-familiar-patients105/`.

Physical device checks remain required: update in place (never uninstall),
compare the screen with the supplied reference, add a synthetic patient,
dictate, generate/edit, reopen, and check microphone/camera interruption handling.
Existing old reports are preserved but this release does not recover their
archive. Do not claim on-device behavior from mocked tests or package markers.
