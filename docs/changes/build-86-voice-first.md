# Build 86 — voice-first interface and call continuity

Approved by Oliver on October 20, 2026. Native source commit: `16bdbdd`.

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
- 31 targeted controller, clinical audio lifecycle, native client, keyboard layout, adapter and clinical-preservation tests passed.
- Browser rendering of actual components checked bottom controls at 320×568, 375×667 and 393×852; text composer checked with compact keyboard. This is not a native-device interaction test.
- Existing service health checks passed. No server restart/deployment, stored clinical-data mutation or conversation migration.
- Physical acceptance still required: Mail/Safari background conversation with quiet interval and tool response; lock/unlock; AirPods; phone interruption; network switching; microphone-off indicator after End; small-screen large-text/VoiceOver.
- Bluetooth routing remains OS-owned; no new in-app route picker or CallKit integration. Background reliability must not be declared proven until phone tests pass. Build85 remains fallback.

## Release tracking

Final candidate: https://expo.dev/accounts/aalami/projects/echo-app/builds/e3730100-a913-4bce-9580-4583fbc4a720

Submission: https://expo.dev/accounts/aalami/projects/echo-app/submissions/47fcd3bf-90cd-4c7d-9c4d-ebf2eb9d2724

The earlier candidate `0015d0ec-5724-4661-a94f-f87396c83292` was canceled before delivery to include pending-recording cleanup. Native build and Apple processing status are tracked in the workspace release wiki, separately from physical acceptance.

Native archive succeeded on the final candidate. An intermediate candidate failed because the Swift event emitter needed an explicit React import; corrected before delivery. Another candidate was canceled to include the startup Retry UI. No failed/canceled candidate was uploaded to Apple.

Native bridge reference: [React Native 0.81 iOS modules](https://reactnative.dev/docs/0.81/legacy/native-modules-ios).

Downloaded final IPA verified: bundle `com.oppersmedical.echo`, version86; `audio`, `fetch`, `remote-notification` background modes; native event emitter and microphone/Retry UI present. SHA-256 `8e5a530bb497951194d94ef9ac7782c199cce3fddbb742dbdab322ecdd408e01`.
