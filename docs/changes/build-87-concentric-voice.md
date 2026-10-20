# Build 87 — concentric Live Voice

Requested by Oliver on October 20, 2026 after trying Build86.

- Removed the ECG and all center glyphs from the voice orb. Six concentric rings lead into a 52-point solid center.
- Preserved state colors, measured audio animation and Reduce Motion behavior. Microphone/mic-slash remains on its dedicated button.
- Connect / Disconnect replace Start call / End call, with a power icon for Disconnect. Related accessibility labels, recovery messages and dictation handoff use consistent connection wording.
- No audio lifecycle, server, data or permission changes. Background/device acceptance limits from Build86 still apply.

Verification: TypeScript and 12 existing targeted checks passed. Rendered actual components at 320×568, 375×667 and 393×852; bottom controls fit. Idle Connect also verified at 320×568 and 393×852. These are browser renders, not native-device acceptance.

Native release and Apple availability pending.
