# Build 81 — Clean report text and Read Back

Oliver requested removal of inline `Suggested` labels because they disrupt operative dictation/readback and require cleanup. Keep draft-first generation and both edit options; no additional questionnaire or approval gate.

## Implementation

- Split generated suggestion spans into clean report text and section-specific `reportReview.routineDefaults` metadata. Display a review-only Drafting note above the report. The note is not read aloud, copied or emailed. Unknown/ambiguous `[verify: ...]` and `[unreadable]` spans are not stripped.
- Keep metadata alongside patient reports in the existing persisted/synced reportReview object. Manual edits retain the drafting provenance. The note describes what routine wording was used and explicitly says edits take precedence.
- AI editing receives section-scoped annotated text only as model input; presentation is clean again on return. Changed or deleted manual statements are never restored from an old default. Documented `None` in a different section remains documented.
- Read Back, displayed report, copy, encounter export and email use the clean presentation even for old inline-marked reports. Existing reports are not migrated on launch. Explicit manual save/finalization can save clean text while preserving metadata. Sent-status comparisons use the exact clean text sent; receipt history remains intact.
- No backend restart, extra model call, credential change, real patient-data modification or email required for this update. Server policy remains v3.2, so old clients retain visible inline provenance until updated.
- Existing dictated preamble, original section order, final Description of Procedure/recovery ending and corrected Oliver voice are unchanged.

## Verification

- TypeScript and iOS production export passed.
- 52 focused automated tests passed, including metadata separation, source uncertainty preservation, legacy formatting, manual-edit protection, AI-edit provenance, review-only component rendering, encrypted jobs and recovery.
- Native build/submission and phone acceptance recorded below when complete. Update in place; never uninstall while device-local source images may be present.
