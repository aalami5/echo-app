# Build 76 — Add Patient OCR and speech authentication

## Diagnosis

Both patient OCR and recorded dictation called OpenAI directly with a provider credential cached on each phone. Bootstrap only populated an absent OpenAI key, so a rejected cached credential persisted. The reported Whisper 401 is consistent with this path; the exact old-phone credential was not extracted. The server credential passes provider authorization and real OCR/transcription requests.

OCR also forced a crop, compressed captures at quality 0.3, read photos while assuming JPEG, and displayed errors only in a hidden confirmation dialog. Permission denial left the scanning busy flag set.

## Changes

- Authenticated `/patients/media/scan` and `/patients/media/transcribe` use the existing server-owned provider key. Missing auth/config fails closed. No provider key is sent by the client; no provider response bodies, images, or transcripts are logged by these routes. Files are processed in memory with bounded uploads/timeouts; responses are no-store.
- Shared client request helper refreshes app gateway authentication once on 401/403. Upstream provider-auth failure returns a safe service error rather than a misleading app-login 401.
- OCR converts HEIC/other supported iPhone images to bounded JPEG, retains the full frame, improves text quality, preserves leading-zero MRNs, and fills only extracted fields for review before Save. Temporary converted images are removed. Denied permission and unreadable images show actionable errors.
- Chief complaint, operative report, and chat recorded transcription use the shared server route; no phone-side OpenAI key is required. Empty speech has an explicit retry message in Add Patient.
- The Add Patient screen shows scan errors even after the image picker closes.
- No patient/report storage or sync algorithm changed. Original report text and historical receipts are untouched.

## Verification

- TypeScript, production iOS export, server/media/auth/clinical-preservation/receipt and rendered UI tests.
- Real public HTTPS OCR of a synthetic label recovered all six fields, including MRN `00012345` and DOB `01/02/1970`.
- Real public HTTPS Whisper transcription of synthetic speech: “This is a test recording. Left calf pain with walking that improves with rest.”
- Anonymous requests rejected; no-store responses; patient/report ciphertext fingerprints identical before and after deployment and live media checks.
- Physical iPhone camera, microphone, and native HEIC conversion remain an installation acceptance check, not proven by simulated hooks.

## Rollout

Backend deployed by restarting the existing patient-sync service with unchanged environment. Client requires Build 76 installed in place; do not uninstall Echo. Existing builds keep using the old direct-provider routes. No OpenClaw upgrade required.

## Verified release

- PR https://github.com/aalami5/echo-app/pull/3 merged as `0b65c801a03d16e48966eaafe673f2b1b143d1ab`. All 37 targeted tests passed.
- EAS Build 76 `7f76fc77-4a28-4327-9a9e-c78777277bb5` FINISHED. Downloaded IPA confirms `com.oppersmedical.echo`, version1.0.0/build76, and the shipped authenticated media endpoint/error UI. Native build logs include ExpoImageManipulator.
- TestFlight submission `9465aa7d-1f15-4744-93b3-132e15951a6f` FINISHED at the 2026-09-20T04:26:45Z status check. First auto-submit request rejected optional release notes as Enterprise-only; retried without that field successfully, same build.
- Apple processing/tester availability and physical-phone acceptance remain separate; install Build76 in place, scan a label and verify fields, then dictate a chief complaint.
