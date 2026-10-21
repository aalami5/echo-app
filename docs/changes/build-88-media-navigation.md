# Build 88 — media input and persistent app navigation

Implements the native UI/media work from [issue 4](https://github.com/aalami5/echo-app/issues/4).

- Live Voice is inline in the existing tab layout instead of a full-screen modal. Chat/Live Voice, Dictate, Today, Patients and Settings remain available, with a hairline separator above the original navigation.
- Voice controls: microphone/mic-slash, Text, Photos, Camera, and explicit Hang up. Hang up stops the call and closes camera without discarding the draft; switching tabs does not stop the call.
- The text plus menu offers Files, Photos and Live Camera. Both entry points share preparation and upload code, limits, previews, and send behavior.
- Live Camera provides a live preview, front/back selection, capture, review, retake and explicit Add photo, then Send. Camera closes on tab departure/background/hangup. It does not continuously stream video to the agent: only explicitly captured and sent images enter the shared conversation. The voice transport currently supports audio and agent consultations, not a video stream.
- Photos use the system selection picker; HEIC is normalized to bounded JPEG. Up to five attachments, 6 MB each. Chosen files are copied to an app-private draft directory, previews/removal are available, and upload occurs only on Send.
- Local text/attachment drafts persist by conversation; stable upload IDs make upload retries idempotent. Uncertain sends use the existing outbox/receipt mechanism rather than resubmitting a new request.
- Existing patient/report flows and backend were not modified. Camera permissions and the Expo camera module are included in the native build. No microphone capture is requested by the camera.

## Verification

- TypeScript passes; 23 distinct targeted checks across media preparation/UI, voice view/lifecycle, chat viewport, native requests and clinical audio/input handoff pass.
- iOS production JS/Hermes export passes.
- Actual VoiceCallView/ChatViewport browser renders checked at 320×568, 375×667, and 393×852; media and Hang up controls fit above reserved navigation. Draft preview/send also fits at 320×568. Browser renders are not physical-device screenshots.
- Still requires physical iPhone verification: camera permission prompt, simultaneous voice/camera audio routing, system photo picker, background/lock/AirPods recovery, and a real image round trip during voice. Continuous live video is not implemented or claimed.

## Release

Build 88 requested. Native build/submission status will be recorded after verification. Update in place; do not uninstall (preserve existing local clinical data).
