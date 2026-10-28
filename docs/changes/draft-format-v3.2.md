# Draft-first format restoration — September 29, 2026

## Scope

Server-only `/compose` change for Build 80's draft-first workflow. Restore the dictated patient/MRN/operation-date preamble and the original section order; Description of Procedure is the final section, with disposition in its final sentence. No pre-draft questionnaire, old-case comparison, extra model pass, or native build.

Oliver requested normal defaults and reliance on his editing. The implementation uses **inline suggested wording**, not undocumented facts: `[Suggested: None.]` for missing complications/specimens/drains and a suggested stable-to-PACU closing only when both elements are absent and no incompatible clinical course is documented. Source facts and exceptions win. Uncertainty is not absence. No blanket normal anatomical findings, invented numbers, devices, doses, anesthesia, consent, timeout or other performed steps. Other missing standard sections say `Not specified`.

AI edits preserve manual changes and suggestion labels; general formatting instructions are not clinical confirmation. Actual case corrections can replace suggestions. Existing reports are never rewritten automatically. Review/finalize/email behavior is unchanged, and visible suggestion text remains in the report unless the surgeon edits it.

Policy/cache version is `draft-first-v3.2`, preventing new draft requests from reusing a cached v3.1 result. Explicit resume of an old job can still retrieve its original result.

## Verification and deployment

Run `node --test server/*.test.js tests/draft-first-service.test.cjs` and the opt-in `tests/operative-compose-live.cjs` with credentials supplied through the existing runtime, never logged. The synthetic suite checks preamble/section order, preservation of source details, abnormal ICU recovery, ambiguous complications, partial disposition, and narrow AI editing.

Deploy by restarting only `com.echo.patient-sync` after checking for active jobs. Preserve all existing environment and clinical storage; compare patient/report/receipt hashes around deployment. Test authenticated public endpoint with synthetic data and verify returned policy. No native update required beyond already-released Build 80. Rollback only the server prompt/version change if needed; do not revert patient data or unrelated work.

## Results

- 37 focused automated tests passed (server suites plus draft-first client service).
- Ten synthetic provider scenarios exercised; all passed after prompt clarification and fixing an overly literal test for `vasopressor` versus `vasopressors`. Re-ran all four disposition/exception cases after the final wording change: 4/4 passed. Tests validate examples, not clinical accuracy guarantees.
- Deployed authenticated public composition returned v3.2 with correct preamble, section order, explicit suggested negatives and suggested PACU closing, in 4.578 seconds excluding OCR. No additional model pass added.
- Initial Python public probe received 403; Node client reached the deployed API. A probe made immediately during the second restart returned 502; the subsequent readiness/composition check passed. These were test failures, not patient requests.
- Patient, dictation and email-receipt file SHA-256 hashes unchanged across deployment. No actual patient report generated, finalized or sent. Physical-phone acceptance remains unverified.
