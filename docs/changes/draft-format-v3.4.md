# Paragraph-only operative description — September 30, 2026

Oliver corrected the September 29 interpretation: numbering belongs in the early Procedure(s) list, not in Description of Procedure. The active /compose policy and job cache are now draft-first-v3.4.

- Preoperative/postoperative diagnoses and Procedure(s) remain numbered, including single-item lists.
- Description of Procedure is full chronological prose paragraphs, without numbered steps, bullets or step subheadings. It remains last, with the documented disposition or existing eligible recovery suggestion in the final sentence.
- Dr. Oliver Aalami, dictated introduction, heading order, source fidelity and separate routine-default review metadata are unchanged. No new inference/default behavior introduced.
- New-generation instructions override obsolete style preferences requesting numbered narrative steps.
- AI editing preserves paragraph form and manual additions. A request to remove legacy description numbering edits only that section; it must not add headings or facts elsewhere. An unrelated narrow edit is not permission to rewrite a legacy report.
- App paths inspected: dictationService.ts, both dictation screens, reportPresentation.ts; playback/copy/email continue to use clean report text. No native code change or new TestFlight build.

## Verification and deployment

26 focused automated checks passed. All 14 provider synthetic cases passed locally. First public checks caught an overbroad legacy-format edit adding unrelated headings/defaults; tightened section-only instruction and verified exact whole-report wording equivalence after removing only description numbers. Two local edit checks and all four final public checks passed (combined procedures, alternate surgeon, narrow manual-preserving edit, legacy paragraph conversion). Final public artifact directory: /Users/echo/.openclaw/tmp/echo-compose-live-QbyZcL.

Restarted only com.echo.patient-sync after verifying zero running saved jobs. Patient, dictation and email-receipt file hashes unchanged. No existing reports rewritten or emailed. Actual phone acceptance is not yet verified.

Operative Report Workflow skill updated through Workshop (operative-report-workflow-20260930-e4fe13d6dd applied); wiki current-format override added. To correct a saved draft, use Edit with AI: “Convert Description of Procedure to unnumbered paragraphs. Keep all wording and the numbered diagnosis and Procedure(s) lists unchanged.”
