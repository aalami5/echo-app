# Focused operative Findings — September 30, 2026

Oliver records operative technical details in the brief-op Findings field. That input convention must not become the final report structure.

## Active changes

`server/operative-drafting.js`, /compose policy/cache `draft-first-v3.5`:
- Classify by meaning, regardless of source headings. Final Findings is concise key documented anatomy/pathology, lesion severity, tissue quality, meaningful negatives and important completion observations.
- Move access, equipment/sizes, medications, technical sequence and closure into Description of Procedure or the appropriate existing field; retain the details rather than dropping them. Split mixed sentences.
- Observed vessel dimensions can be findings; device dimensions are procedural details. Completion observations can also appear in chronological narrative.
- Actions alone do not prove normal anatomy or technical success. With no actual observation, Findings says Not specified.
- Focused AI cleanup relocates details while preserving manual additions and unrelated sections. Draft-first, paragraph narrative, numbered early lists, full name, review metadata and clean Read Back remain unchanged.

## Verification

23 automated checks passed. Initial provider run caught three pre-existing-format preservation failures (missing recovery suggestion, mismatched surgeon in opening, and lost suggestion provenance); added final new-draft/edit preservation reminders. A fourth test assertion wrongly demanded lidocaine concentration in the narrative despite preservation in Anesthesia; corrected that check to assert preservation in the complete report. All 18 provider-backed synthetic cases then passed, followed by all four new Findings cases through the live public endpoint. Cases cover mixed observations/actions, actions-only notes, observed vessel diameters versus suture technique, and focused editing/manual text retention. Final public artifact directory: /Users/echo/.openclaw/tmp/echo-compose-live-8enfaN.

## Deployment

Restarted only com.echo.patient-sync after inspecting existing configuration and confirming zero running saved jobs. No configuration changes. Patient, dictation and email-receipt hashes unchanged. Server-only update; no native app build. Actual phone acceptance not tested and no existing reports rewritten or sent.

Workflow skill updated through Workshop proposal operative-report-workflow-20260930-612d002df5; wiki guidance updated and lint passed. To update an existing saved draft: Edit with AI, requesting key observations only in Findings and relocation of procedural details into the narrative without losing information.
