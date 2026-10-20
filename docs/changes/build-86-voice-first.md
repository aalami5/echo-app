# Build 86 — voice-first interface and call continuity

Approved by Oliver on October 20, 2026. Native source commit: `26daed2`.

## User-facing changes

- Full-screen Live Voice starts with an explicit Start call action; opening the screen never starts the microphone automatically.
- Reactive orb, one short state label, familiar microphone/microphone-slash control, Text and End call. Optional captions. More contains conversations, Activity, Memory and Inbox.
- Text and voice share the same conversation and live session. Text does not hang up. End call releases audio without canceling accepted agent tasks.
- Compact call strip in text, + attachment button, message long-press Copy/Share. Retains Build85 keyboard and bottom-tab spacing.
- VoiceOver action labels, minimum 54-point icon targets and Reduce Motion support. Offscreen animation/metering stops independently of the call.

## Call lifecycle

- App-scoped controller survives screen unmount and ordinary background transitions. Logout explicitly ends it.
- Declares iOS `audio` background mode, preserves existing notification/fetch modes, and enables Expo background audio only during an active call.
- Native playAndRecord/voiceChat route no longer overrides an existing headset with speaker output.
- Interruption, removed audio device or media-services reset pauses audio. Explicit Resume audio keeps the microphone muted; unmuting is a separate user action.
- Temporary WebRTC disconnection receives a 20-second recovery window. Terminal failure stops audio and offers an explicit fresh call in the same conversation. No provider re-offer or tool replay.
- Clinical dictation requires confirming End call before recording. A shared audio lease blocks personal voice during clinical capture, including pending permission/native-recorder creation. Leaving during pending acquisition cleans up any late recorder before releasing that lease.

## Verification and limits

- TypeScript passed; iOS Metro export passed before native build.
- 29 targeted controller, clinical audio lifecycle, native client, keyboard layout, adapter and clinical-preservation tests passed.
- Browser rendering of actual components checked bottom controls at 320×568, 375×667 and 393×852; text composer checked with compact keyboard. This is not a native-device interaction test.
- Existing service health checks passed. No server restart/deployment, stored clinical-data mutation or conversation migration.
- Physical acceptance still required: Mail/Safari background conversation with quiet interval and tool response; lock/unlock; AirPods; phone interruption; network switching; microphone-off indicator after End; small-screen large-text/VoiceOver.
- Bluetooth routing remains OS-owned; no new in-app route picker or CallKit integration. Background reliability must not be declared proven until phone tests pass. Build85 remains fallback.

## Release tracking

Final candidate: https://expo.dev/accounts/aalami/projects/echo-app/builds/e4875c65-0023-4839-bef6-a3b24316b3d3

Submission: https://expo.dev/accounts/aalami/projects/echo-app/submissions/08a2e2cc-6f4f-4819-a77e-ef73afc33cd5

The earlier candidate `0015d0ec-5724-4661-a94f-f87396c83292` was canceled before delivery to include pending-recording cleanup. Native build and Apple processing status are tracked in the workspace release wiki, separately from physical acceptance.
