# Build 94 — simpler Live Voice

Removes the Tasks / Show all panel beneath Listening and the panel-only four-second task polling. No replacement row or spacer.

Preserves captions, attachment picker, Chat, Hang up, muted-red microphone, navigation, startup memory/spoken recap, separate More → Activity view, backend task history and uncertain-send receipts. No backend deployment, configuration changes, data deletion, or action replay.

Verification: TypeScript passed; 11 existing targeted voice/media/lifecycle/task-history tests passed. Screen assertions additionally verify no Tasks/Show all row while captions/mute/hang-up/chat remain. iOS export passed. Native build and signed-package verification follow separately. Physical iPhone acceptance pending; update in place.

## Verified release
- Source commit: `1db727f02673e72b84ee5951e6ca72e3ded2187c`.
- EAS build `1d4f3284-62a3-4a2d-9f83-f1122b8f3b39`: FINISHED; submission `fddb0d5c-267e-43d7-a2ef-64d5ba8111e6`: FINISHED.
- Signed IPA: `com.oppersmedical.echo`, version 1.0.0, build 94. Background audio/fetch/push preserved. Task-panel strings absent; captions, Chat, Hang up and muted-red markers present.
- Apple build `8f9988d3-c6d5-4017-89c7-8ba5c9d97823`: VALID / IN_BETA_TESTING, autoNotifyEnabled true, verified 2026-10-26 05:27 UTC. Notification receipt not verified.
- Evidence: workspace `artifacts/echo-build94/` (IPA, package verification, EAS status and Apple response). Physical iPhone layout/audio acceptance remains pending.
