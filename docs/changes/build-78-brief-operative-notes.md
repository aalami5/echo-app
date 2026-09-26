# Build 78 — Brief note → Full operative report

Authorized September 26, 2026: support all existing procedure types, not a three-family pilot; clear current-case brief-note details are definitive regardless of typed, dictated or screenshot input. Unreadable/conflicting data remain reviewable.

## Shipped flow

- Patient-linked and standalone report entry now opens a source-first builder. Type/paste, dictate or attach a brief note; the server identifies all procedures/adjuncts. A generated catalog covers all 16 code-library procedures plus the other existing sample-report entries (44 entries including named variants/aliases); custom and mixed procedures are accepted without a category gate. Catalog outlines are reference suggestions, not surgeon-approved facts.
- Screenshot OCR uses the server-owned key, preserves full-frame text, marks uncertainty and persists extracted text/warnings locally and through encrypted clinical sync. Images normalize HEIC to JPEG. Failed or unavailable screenshots stop analysis, rather than silently disappear. Regeneration uses the retained text and case corrections.
- Current sources override routine technique. Show extracted facts with exact source quotes, procedure matches, and a compact clarification area. Previous-case copies, including legacy `-copy` records, are excluded from current evidence.
- Matching saved examples propose a de-identified reusable technique for review; manual example selection is also available. Approved server profiles are preferred. User can edit the displayed steps, explicitly confirm them for this case, and independently approve saving them as the usual technique. Saving a profile does not confirm a case; editing a technique clears the case checkbox. All type/variant profiles can be created; no historical report corpus is silently promoted to approved technique.
- Backend profiles have optimistic version checks and encrypted preserved history; source sessions and generated drafts are encrypted and versioned. No separate hosted data destination or credential rotation.
- Draft sentences cite source facts or case-confirmed routine steps. Quote and numeric validation plus a separate semantic audit reject unsupported statements; unambiguous missing facts identified by audit are restored from the exact source. Drafts still require surgeon review—these checks are not proof of clinical accuracy.
- Unknown clinical negatives are not set to None/No Foley by default. Missing complications generate one review item. Case data already in the note needs no redundant confirmation. Unknown optional fields are omitted.
- Patient report source detail is available in a collapsed review panel. Case-note changes invalidate the draft's source fingerprint for finalization/email. Direct edits are identified as manual and clear generated sentence links. Open Items must be resolved before finalization; the final confirmation is explicit. No reports are automatically finalized or emailed.
- Generation is narrative-only, not a billing-code verification service. The old unverified bundled CPT/ICD hints are not copied into new drafts; separate downstream coding/RVU workflows remain unchanged.
- Existing patient/report storage, additive restore and email receipt history are preserved. This does not migrate hosting or guarantee full multi-device synchronization.

## Model / policy

Policy `brief-note-v1`, server-selected `gpt-5.4-2026-03-05` (config override `OPERATIVE_DRAFT_MODEL`). Uses existing OpenAI provider credentials and authenticated patient-sync route `/patients/operative`. Low reasoning, bounded requests, structured draft output, no provider body/PHI logging, no-store responses and fail-closed auth. Official API support: https://developers.openai.com/api/docs/models/gpt-5.4 . No runtime Workshop skill is required; the policy is wired into actual app requests.

## Verification

- TypeScript, iOS production export, unit/API/storage regression checks and rendered mobile-component tests.
- Synthetic live evaluations: dialysis access; lower-extremity angioplasty with a 7 Fr source overriding a confirmed 6 Fr routine step; EVAR; carotid endarterectomy; IVC filter retrieval; wound debridement with a custom adjunct; absent clinical negatives; conflicting laterality; screenshot-to-source-to-report. Latest evaluation: all nine passed; complete typed cases returned zero review items, incomplete case retained a complications question, conflicting side remained flagged. These are synthetic tests, not clinical validation of all procedure variants.
- Real physical iPhone acceptance remains necessary after TestFlight installation, including OCR readability, keyboard/scroll usability and a representative real-case draft reviewed by Oliver.

## Deployment / rollback

Deploy only this repo's patient-sync backend; restart `com.echo.patient-sync` with unchanged environment. Preserve clinical files and encryption key. Old clients retain their old generation path; the new builder requires Build 78 installed in place. Do not uninstall the app.

Rollback code by restoring the prior tracked backend version and restarting the same service; leave encrypted profile/session history intact. A Build 78 client will show an unavailable-service error if the new routes are rolled back; it does not silently fall back to old unsafe defaults.

## Release evidence — September 26

- Code commit: `60655e1cf1486ca78d30b8d378dd29fe3006efa8`, pushed to shipped branch `build-35-text-selection`.
- 53 automated tests passed; TypeScript and production iOS export passed. A 390px-wide rendered builder had no horizontal overflow and exposed the full generation controls. This browser rendering is not a physical iPhone test.
- Production backend restarted with its existing configuration. Public authenticated catalog: HTTP 200, 44 entries, policy `brief-note-v1`, no-store; anonymous request: 401. Public synthetic report returned 11 grounded facts/statements with zero open questions. Existing encrypted patients, dictations and email-receipt file hashes were unchanged.
- Native Build 78 `a22f4c8b-1447-4a8c-8fc5-617b9c3e802c` FINISHED. TestFlight submission `df30160d-d53a-4b81-abc1-7b8174199e0e` was started automatically; see subsequent completion record.
- Downloaded 31.3 MB IPA verifies bundle `com.oppersmedical.echo`, build 78, new builder/endpoint/case-confirmation text, retained Oliver and River IDs, and absence of the old silent no-complications default prompt.
- TestFlight submission `df30160d-d53a-4b81-abc1-7b8174199e0e` FINISHED, verified September 26 at approximately 17:43 UTC. Apple processing/tester availability and physical-phone acceptance remain separate checks. No production patient reports were created or emailed by release verification.
