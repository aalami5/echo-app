# Attachment menu icons

Replaces the shared voice/chat attachment menu's text-only Camera, Photo Library,
Files and Cancel buttons with camera, stacked-image, document and close icons.
Uses the existing 54-point VoiceIconButton control with accessible action labels,
disabled states and wrapping layout. Picker handlers, previews, explicit sending
and voice lifecycle are unchanged.

Verification: TypeScript and 11 existing attachment/voice checks passed. Updated
one stale test label from Text to Chat to match the already-shipped control.
Physical iPhone layout/picker acceptance remains unverified. This source change
is not included in installed Build 91; no new native build was submitted here.

## Build 92 release — October 23, 2026

Following authorization to build and deploy, version 1.0.0 (92) was released
from source `41db1b52fc440a6f60a4f4f3f62ce49b48b85d8a`.

- EAS build: `5c69acd5-c80c-4ad2-8da1-ea1bc7f29f33`, FINISHED.
- Submission: `a3775223-2699-47f6-81fe-c0b9f1978248`, FINISHED.
- Apple build: `cb881e05-b88f-4e07-8c11-f8aaf7bd6b51`, VALID;
  direct beta detail confirms IN_BETA_TESTING internally.
- Internal group membership and inclusion of Build 92 verified for the owner.
- Downloaded IPA matches bundle `com.oppersmedical.echo`, version/build,
  source record, icon markers, and audio background mode.
- SHA256: `670afcd5ff1f61e318aaec843a62ca30e84540c6f45a65ffe4a6f3f09eea165c`.

No backend or clinical workflow changes. Physical iPhone layout/picker behavior
remains pending. Update in place through TestFlight; do not uninstall.
