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

## Deployed acceptance checks

- Public authenticated job flow: three short synthetic pictures → report 7.606 seconds; subsequent targeted edit 2.428 seconds (total 10.034). Detailed three-picture cold flow with final policy v3.1 → report 17.615 seconds; subsequent targeted edit 6.791 seconds (total 24.406). Full meaningful measurements/negation checked; previous-case values excluded; unrelated manually inserted follow-up retained. Retries returned the same job/result and anonymous access was rejected.
- Manual narrative review caught undocumented positioning/prep boilerplate in one early synthetic draft. Tightened the direct prompt explicitly (no extra call or checklist) and expanded live checks; all six synthetic cases passed again, including the routine-boilerplate negative check. No claim that a small synthetic suite guarantees clinical correctness.
- SHA-256 hashes for patients.json, dictations.json and operative-email-receipts.json remained unchanged through final deployment and smoke tests. No report finalized or emailed. Auth, encryption keys and unrelated services unchanged.
- Initial Build 80 attempt a6de6fe7-d4fa-4bd7-b71d-55246fc456c3 canceled before upload to include a legacy standalone-screen error-return fix. Replacement native build: 2b13a6b8-2919-4982-bbd4-e3523ecf537f (source 05f8a4a); submission fea7a60e-ec9d-4385-a523-663c04974056. Final artifact/upload verification pending.

- Downloaded replacement IPA verifies bundle com.oppersmedical.echo, CFBundleVersion 80, SHA-256 6b825c1a434d62161ac314f5451067139c092841961da8557ef29af019ddacce. Native JS contains Generate draft, both editing options, /compose and the corrected Oliver voice. Mandatory-builder/Retry analysis/confirmed-technique UI strings and obsolete voice ID are absent. Build FINISHED; Apple submission currently processing.

- Final: replacement Build 80 FINISHED and submission fea7a60e-ec9d-4385-a523-663c04974056 successfully uploaded to Apple App Store Connect. Apple processing/tester availability and real-phone acceptance remain separate/unverified. Install in place when TestFlight shows 80.
