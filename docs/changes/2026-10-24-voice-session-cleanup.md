# Voice-session cleanup hotfix — October 24, 2026

## Symptom and confirmed defect
The iPhone showed Ready when you are but Connect returned “End the current call before starting another”. A synthetic reproduction confirmed that the adapter retained a voice record after an authoritative `talk.event / session.ended`. This reproduces the displayed block; the originating phone sequence was not traced.

## Correction
- Remove only the session named in the terminal event; retain its public status event.
- Serialize recovery and creation per conversation.
- Close expired, unexchanged allocations before reconnecting; never expire an established call solely because its offer credential expires.
- Close failed SDP exchanges. If cleanup fails, retain the record and retry on reconnect instead of admitting a competing call.
- Never replay requests or abort accepted tasks as part of voice cleanup.

## Verification
All 53 server tests passed, including five added regression tests (provider rejection, malformed answer and transport failure are separately exercised). Public-service checks passed: two create / duplicate-block / close cycles in the existing Echo project, with Home left free. Diagnostic sessions closed. Unauthenticated access returned HTTP 401. Live audio and physical iPhone reconnect remain unverified.

All 2,833 baseline data files hashed before the reload were unchanged afterward; no clinical jobs were running before deployment. No clinical data migration, mobile build or gateway restart.

## Deployment and rollback
- Isolated deployed code: `/Users/echo/Projects/echo-voice-session-cleanup`, commit `0a06271`, branch `fix/voice-session-cleanup-20261024`.
- App development branch also contains the fix in `6221770`, preserving unrelated uncommitted task-panel changes.
- LaunchAgent `com.echo.patient-sync` now runs the isolated checkout's `server/index.js`, with its WorkingDirectory set to that server directory. Existing environment, credentials, port and policy were preserved.
- Its server dependencies are linked to the original app checkout's server/node_modules. Keep both directories until a subsequent deliberate deployment replaces this release.
- Private backup: `~/.openclaw/backups/voice-session-cleanup-20261024/` (LaunchAgent and baseline hashes; never commit these).
- First bootstrap returned macOS error 5; previous configuration restored and health verified. Reload with a short post-bootout delay succeeded. Running process path and public health verified.
- Rollback: restore the saved LaunchAgent, boot out the service, allow removal to finish, then bootstrap and verify health. Preserve all data and environment values. Do not restart the entire OpenClaw gateway for this adapter-only change.
