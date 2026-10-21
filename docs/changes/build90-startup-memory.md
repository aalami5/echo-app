# Build 90 — startup continuity and Chat caption

- Live Voice speech-bubble caption is Chat, with corresponding accessibility label.
- Single-owner gateway prepares a fresh, bounded reference packet before provider creation: recent allowed personal conversation turns, native task/artifact snapshots, and selected saved memory notes.
- Does not replay requests, send messages, infer completion from promises, or automatically resume tasks. Live status still requires a fresh tool check.
- Unknown conversations, groups, other users and clinical workflow session keys are excluded. Native read RPC authorization is retained. No permission expansion or merged sessions.
- Retrieval failure produces explicit partial/unavailable context; no stale prior packet is reused.

## Operational dependency

Startup memory is server-side, not baked into the IPA. `scripts/install-startup-memory.cjs` installs a version-checked integration in the current OpenClaw Talk bundle and preserves the original bundle in the dated gateway backup. It imports `gateway/startup-memory.mjs` at runtime. Both browser and app routes use the shared preparation function. Revalidate/reapply after an OpenClaw upgrade; this local integration is not an upstream feature. Restart the gateway after bundle changes. Restore the backed-up bundle and restart to roll back; do not restore patient data or credentials.

## Evidence and limits

Targeted unit tests cover owner/session restrictions, newer corrections, unfinished work, failed/slow retrieval, Unicode bounds and source refresh. Post-restart native voice-create probe loaded a ready packet (3 sources, 2 memory notes, 6432 bytes, approximately 6 seconds). No clinical endpoints or data changed. Physical-phone recall acceptance remains required; bounded recent context is not a guarantee of exhaustive older conversation recall.
