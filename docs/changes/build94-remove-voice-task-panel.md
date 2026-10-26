# Build 94 — simpler Live Voice

Removes the Tasks / Show all panel beneath Listening and the panel-only four-second task polling. No replacement row or spacer.

Preserves captions, attachment picker, Chat, Hang up, muted-red microphone, navigation, startup memory/spoken recap, separate More → Activity view, backend task history and uncertain-send receipts. No backend deployment, configuration changes, data deletion, or action replay.

Verification: TypeScript passed; 11 existing targeted voice/media/lifecycle/task-history tests passed. Screen assertions additionally verify no Tasks/Show all row while captions/mute/hang-up/chat remain. iOS export passed. Native build and signed-package verification follow separately. Physical iPhone acceptance pending; update in place.
