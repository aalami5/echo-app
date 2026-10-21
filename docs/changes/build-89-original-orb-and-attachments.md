# Build 89 — original Echo rings and attachment menu

Status: available in internal TestFlight. Verified October 21, 2026, 14:37 UTC: native build/submission FINISHED; Apple VALID / IN_BETA_TESTING.

## Approved scope

- Replace the six thin Live Voice rings with the original Echo mark: three graduated rings around a bright solid center. No ECG or other center symbol.
- Restore gentle staggered outward breathing, with restrained working/connecting pulses and actual input/output-level response during listening/speaking. Keep current status colors and labels: teal listening, violet working, blue speaking, amber connecting/reconnecting, gray muted/paused.
- Honor Reduce Motion; stop visual loops when backgrounded/hidden and reset audio motion when paused or muted. A muted microphone can still receive Echo speech, correctly showing the speaking color and mic-muted label.
- Include the already-committed shared + attachment menu: Camera, Photo Library, Files. Explicit preview and Send remain required; menu navigation does not disconnect voice.
- Preserve Build 88's persistent tabs, microphone icon, Connect/Hang up controls, voice lifecycle, background-audio configuration, conversation data and clinical workflows. This patch does not modify the clinical Avatar.

## Verification

- TypeScript passes.
- Nine existing voice-view, attachment UI and voice-lifecycle tests pass; one new motion-lifecycle test covers stopping/resetting animation for reduced motion/background, paused stale audio, and unmount cleanup.
- Browser-rendered implemented UI checked at 393×852, 375×667 and 320×568; attachment, text and hang-up controls stay above the tab bar.
- Preview: workspace `artifacts/echo-next-build-original-rings/preview-393.png`. This is a browser render, not an iPhone screenshot. Native animation appearance and device attachment pickers still need physical-phone verification.

Reference: Oliver's original-ring image supplied October 21, 2026. No release or availability claim until a native build/upload and Apple processing are verified.

## Release tracking

Source `815b9ce`. EAS build `448a732a-04e3-40f4-a9ad-6ace0abee184`; automatic submission `d311598a-d7a0-4ae6-9e93-4d69718d8383`. Both FINISHED October 21, 2026. Apple build `e4c9d7e1-8499-4ba5-b089-faf1c4ea3e7e` is VALID; direct buildBetaDetail confirms IN_BETA_TESTING internally and autoNotifyEnabled true. External state READY_FOR_BETA_SUBMISSION; external review was not requested. No agreement blocker. Update in place; do not uninstall.

Downloaded IPA verified Build89, source `815b9cefecaca37ef44aad423b0a38a427ef3bba`, original ring component, + attachment controls and preserved audio/fetch/remote-notification background modes. SHA-256 `1255f279eafe512d25384a4f4e650e8d6ce627e09195144368f6a5b49ff4462f`. Evidence: workspace `artifacts/echo-build89/package-verification.json`.
