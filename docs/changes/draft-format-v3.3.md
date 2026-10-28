# Full surgeon name and numbered dictation — September 29, 2026

## Requested format

Oliver requested the full surgeon name, numbered preoperative diagnoses and procedures, and numbering for each chronological procedure step. Implemented in the actual server `/compose` instructions (policy/cache version `draft-first-v3.3`), not merely an agent playbook.

- Preamble and Surgeon use **Dr. Oliver Aalami**. Expand the abbreviated Dr. Aalami even in an older client header. Explicitly identified different surgeons retain their supplied name; do not invent first names.
- Pre-operative Diagnosis, Post-operative Diagnosis and Procedure(s) use consecutive numbered items, restarting at 1 in each section, even for one item. Unknown diagnoses remain `1. Not specified.` rather than a guessed diagnosis.
- Description of Procedure remains the final section, now chronological numbered narrative paragraphs. Preserve supplied technical detail and finish the last paragraph with the existing disposition closing. Numbering does not create new performed steps, diagnoses, devices or billable procedures.
- Narrow AI edits preserve numbering and unrelated manual text. Existing saved reports are not rewritten; formatting an existing draft can be explicitly requested with Edit with AI.
- Keep draft-first generation, current-case precedence, original heading order, one composition call, and Build 81 clean report/readback plus separate routine-default metadata. No new questionnaire or inline user-facing Suggested labels in Build 81.

## Verification

- 26 automated checks passed (drafting, resumable jobs, client draft-first service and report presentation).
- 13 provider-backed synthetic cases passed on the final prompt: full name/abbreviated header, multiple/single items, different surgeon, numbered AI-edit/manual preservation, documented adverse recovery, uncertain facts, partial disposition, existing draft defaults and exact heading order.
- Initial run passed 12/13; one otherwise uncomplicated unknown-disposition case omitted the expected labeled recovery suggestion. Clarified that numbered paragraphs and pre-existing vascular disease do not change the existing disposition rule. Re-ran all 13 successfully, retaining all adverse/uncertain-condition checks.
- Official OpenAI prompting guidance reviewed for explicit format instructions and evaluation: https://developers.openai.com/api/docs/guides/prompt-engineering . Model/API settings unchanged.
- No active saved jobs before deployment. Restarted only `com.echo.patient-sync`, preserving service configuration and encrypted storage.
- Four synthetic tests through the public deployed endpoint passed: combined procedures, abbreviated/full name, different surgeon, narrow numbered edit and absent-disposition handling (four cases total). Responses report v3.3. Drafting approximately 4.3–5.8 seconds excluding OCR; edit 1.8 seconds. These are examples, not timing guarantees.
- Patient, dictation and email-receipt hashes unchanged. No actual patient reports edited, finalized or emailed. Phone acceptance remains unverified.

## Release

Server-only deployment; no further native build for names/numbering. Build 81 (already uploaded to Apple) is still needed for its separately implemented clean readback/review-note presentation. Apple visibility is not established by these tests.

Use `OPERATIVE_TEST_URL` and runtime-injected `AUTH_TOKEN` to run selected public synthetic cases with `tests/operative-compose-live.cjs`; omit URL for temporary local encrypted test storage. Never supply real patient content in this suite or print credentials. Roll back only this server prompt/version if necessary, not storage or unrelated native changes.
