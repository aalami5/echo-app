# Voice interruption recovery — November 3, 2026

## Confirmed protocol defect

The installed gateway emits `talk.event` with `talkEvent.type=session.closed` when its provider control connection closes. The Echo adapter only released its in-memory call lock on legacy `session.ended`. A phone returning to idle could therefore receive HTTP 409 indefinitely. The reported YouTube/background sequence is a plausible trigger, not a physically reproduced sequence.

## Live server hotfix

The currently deployed adapter at `/Users/echo/Projects/echo-voice-session-cleanup/server/assistant-continuity.js` received only these voice-specific changes, based on its inspected live contents (not this branch's unrelated attachment backend):

- Accept both authoritative terminal event names and release only their exact voice record.
- Include call identity in sanitized public voice events; preserve nonterminal error ownership.
- Return structured `VOICE_SESSION_ACTIVE` conflicts with the authenticated call identity, never provider credentials.
- Expose authenticated conversation-scoped GET voice status for targeted diagnosis.

`com.echo.patient-sync` was restarted after checking Home had no active run and no report-job files had changed in 30 minutes. Configuration, gateway process and unrelated backend features were not changed. Health passed; Home had no allocated call immediately afterward. All 4,253 preexisting non-assistant data files matched their pre-restart hashes. A subsequent read observed a newly allocated Home voice session; audio quality/physical-phone acceptance remains unverified. The separate public-route probe returned HTTP 403, so only local authenticated health/status is independently verified.

Deployment source SHA256: `fe03b38a1b912352fceaf6505e99cba161a4b96c58cbda411ae7aad73b30d486`.
Evidence and preserved rollback source: workspace `artifacts/echo-voice-recovery-20261103/`. Before rollback, inspect for active voice/work and restore only `deployed-source-backup.js` to the same adapter file, then reload the adapter under ordinary review. Never replay uncertain sends or reset user data.

## App improvements prepared for build 104

- Foreground reconciliation catches failed/closed/disconnected peers or ended microphone tracks when iOS suspended callbacks.
- Matching server terminal events close local audio. Late events from a different call cannot close its replacement.
- An orphan conflict offers **Reset connection**. It closes only the returned voice ID, retains retry state on failure, and never opens the microphone or sends a chat turn. Connect remains a separate deliberate action.
- Ordinary backgrounding, UI navigation and transient foreground network recovery still preserve a healthy call. Audio interruptions still require explicit resume and do not silently unmute.
- The already-requested compact Read/Discuss cards are inherited from `0e0b538`.

## Verification and release boundary

- Live-baseline hotfix: 22 synthetic server tests passed.
- Updated source: 25 server protocol tests and 15 voice/media UI tests passed; TypeScript and diff checks passed.
- Local iOS export passed, with the intended route, Reset connection, background-recovery and compact-card markers verified in the Hermes bundle. Use a direct dependency symlink, not a chained one, and an explicit local `EXPO_ROUTER_APP_ROOT` for worktree exports.
- Latest EAS build remains 103. No native compilation, signed IPA, cloud upload, new submission or Apple availability is claimed for 104.
- Prior automatic review explicitly requires owner approval for private-source upload to Expo and internal TestFlight release. This approval remains pending; do not retry that denied release via another route. Once approved, use this branch/revision rather than the earlier card-only checkout, then follow the iOS release verification gates.
- On phone: verify Connect, a healthy background call, YouTube interruption, return/resume, and reconnect without a false competing-call warning. Install updates in place; never uninstall or clear retained data.
