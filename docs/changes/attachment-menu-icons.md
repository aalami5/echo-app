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
