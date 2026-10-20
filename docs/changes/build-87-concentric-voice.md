# Build 87 — concentric Live Voice

Requested by Oliver on October 20, 2026 after trying Build86.

- Removed the ECG and all center glyphs from the voice orb. Six concentric rings lead into a 52-point solid center.
- Preserved state colors, measured audio animation and Reduce Motion behavior. Microphone/mic-slash remains on its dedicated button.
- Connect / Disconnect replace Start call / End call, with a power icon for Disconnect. Related accessibility labels, recovery messages and dictation handoff use consistent connection wording.
- No audio lifecycle, server, data or permission changes. Background/device acceptance limits from Build86 still apply.

Verification: TypeScript and 12 existing targeted checks passed. Rendered actual components at 320×568, 375×667 and 393×852; bottom controls fit. Idle Connect also verified at 320×568 and 393×852. These are browser renders, not native-device acceptance.

Source `121d5b8`. Native build FINISHED: https://expo.dev/accounts/aalami/projects/echo-app/builds/ff5fabd7-ce4e-4cbd-8b6b-9ac2cb8f19f2

Submission: https://expo.dev/accounts/aalami/projects/echo-app/submissions/97a31bea-d61a-45a6-bb49-a9138b490c92

Downloaded IPA confirms Build87, bundle com.oppersmedical.echo, preserved audio/fetch/remote-notification modes, and Connect/Disconnect accessibility labels. SHA-256 `441f89b38b83fe57ba97f9a558ed4b99ddf7de8cd150f2bf6fed192782ca4371`.

October20, 14:24 Pacific: Apple build `f4f5e47d-d6ce-4da9-9956-7535bd2019b5` VALID / IN_BETA_TESTING internally. External READY_FOR_BETA_SUBMISSION; no external review requested. Agreement blocker absent. Update in place; do not uninstall.
