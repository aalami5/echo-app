# Build 80 — Restore draft-first operative reports

## User-directed workflow (September 29, 2026)

Oliver rejected the mandatory analysis, historical-case comparisons and technique confirmation flow. Restore upload pictures / type or dictate notes → Generate draft → Edit (Edit with AI or Edit Text Directly). Draft review remains before finalization/email; no automatic patient-record finalization or sending.

## Implementation

- Both patient-linked and standalone screens call the same direct composition service. Remove the BriefReportBuilder modal and source/confirmed-technique card from their live paths. Existing historical components/routes remain for older clients; no records are migrated/deleted.
- New authenticated `/patients/operative/compose` operation supports encrypted resumable jobs. After parallel/persisted screenshot OCR, one model call writes the complete report. No separate extraction, historical comparison or semantic-audit calls on this path.
- Same pinned GPT-5.4 model, reasoning none, bounded provider requests. Current notes plus corrections are authoritative. Historical sources are excluded from the request; only explicit presentation preferences are used for style. Expand clinical shorthand and organize narrative without assuming undocumented clinical events. Optional missing sections are omitted; essential ambiguous current-case details use short inline verification placeholders, not a pre-draft questionnaire.
- Edit with AI receives the **displayed report**, including manual edits, and applies requested changes narrowly. Previously this service ignored previousReport and rebuilt the entire note from sources. New edit instructions persist as corrections. Concurrent source/report changes prevent stale replacement.
- Retain Build 79 OCR preservation, reconnect/deduplication, versioned encrypted drafts, original pictures, receipts, direct editing, readback voice fix, and explicit email/finalization.

## Verification

- TypeScript, iOS production JS export and 68 automated tests passed. New coverage exercises direct composition, encrypted persistence, exclusion of old patient content, edit payload fidelity, result reconnection, empty/error output rejection, durable OCR and stale-source protection.
- Six live synthetic provider cases passed: multiple source pages, absence of undocumented negatives, explicit size correction, manual text retained during targeted AI edit, genuinely conflicting current-case laterality, and full fistula narrative. Drafting 1.830–4.466 seconds; AI edit 1.564 seconds. These measurements exclude image OCR and are not guarantees for real cases.
- Production smoke and native/TestFlight artifact proof to be recorded after release.

## Deployment and rollback

Restart only com.echo.patient-sync with the existing environment/encryption key. Build 80 requires /compose; keep that route when older clients remain. Native update is necessary to remove the old UI. Install TestFlight update in place; do not delete the app (unextracted images are device-local). Phone acceptance remains distinct from automated/synthetic checks.
