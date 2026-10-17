# Build 82 — Live Voice continuity

Status: October 17, 2026. Backend deployed; iOS build compiled. **Not available in TestFlight: Apple account agreement blocks upload.** Original private-conversation recall also has an unresolved integration defect. This is not a completed DOT-equivalence release.

## Implemented

- Native gateway-controlled OpenAI WebRTC replaces the legacy `ask_echo` request bridge for the new interface.
- Server-owned Home and optional project conversations share typed and finalized spoken history. Recent-context bootstrap and ordinary Echo tools use the same native session.
- Canonical paginated history, incremental chat updates, Activity, exact-run stop, follow-up/steering, durable submission IDs and uncertain-send reconciliation.
- Attachments stay associated with their conversation; generated results are downloadable through the authenticated adapter. Managed gateway-relative media links are relayed as bounded base64, with redirects prohibited and a 12 MB limit. Arbitrary external URLs are not fetched with gateway credentials.
- Memory view plus remember/correct/forget requests, and preservation of the legacy phone/notification inbox. A forget request is not a promise to delete backups/original history.
- Patient/report endpoints and stored clinical files are unchanged. No retained raw call audio by this feature.

## Verified

- Earlier change: 37 adapter/clinical checks, TypeScript and iOS Metro export passed.
- Synthetic Chrome WebRTC: microphone-stream substitute and remote audio established; request reached native agent tools; exact test-file contents were spoken back; typed codeword persisted across the same call/conversation.
- Typed continuation after call closure recalled its own context and retrieved the current project wiki.
- Real PDF upload: extracted its unique verification phrase and produced a result artifact. Real download through the corrected adapter returned exact contents as base64 (HTTP 200).
- Artifact correction: 32 targeted adapter, clinical-preservation and operative-job/drafting tests passed, including external-URL non-fetch and oversized-result rejection.
- Public health, patient health, authenticated assistant bootstrap and Home Activity returned HTTP 200 after deployment. The two clinical storage files matched pre-restart SHA-256 hashes.
- Build 82 finished: https://expo.dev/accounts/aalami/projects/echo-app/builds/68bb5ceb-098e-4a4b-a7b4-4759163351cf

## Not yet passed / blockers

1. **Apple agreement:** automatic submission and one retry returned ERRORED without a useful EAS error. Direct App Store Connect API returned HTTP 403 `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. Account holder must review/accept the pending agreement at https://appstoreconnect.apple.com/business . Do not accept legal terms on their behalf. Afterward retry the existing build, not another identical build. Apple processing/internal availability still require verification.
2. **Cross-private transcript recall:** active-memory is loaded, per-agent rememberAcrossConversations is on, and the session index exists. Fresh app-chat tests retrieved saved memory notes, but failed to retrieve an original private-chat-only codeword. Main-turn tool reports session transcript search unavailable. The recall pass logging `status=ok` does not prove original WhatsApp transcript recall. Investigate protected recall authorization propagation through the selected native agent runtime; root cause is not yet proven. Do not globally enable unrestricted transcript search or merge WhatsApp/group sessions as a workaround.
3. Physical iPhone microphone, speaker/Bluetooth, interruption, force-close/reopen, background task continuation and in-place legacy migration remain unverified. Do not uninstall the existing app.
4. Advanced project summaries, richer approval/task controls and long-term forgetting/index behavior need separate acceptance before claiming every design recommendation complete. Current Memory changes are agent-mediated requests, not a transactional memory editor.

## Resume checklist

- Keep personal clinical workflow separate; do not email or finalize reports during tests.
- Fix and independently prove private WhatsApp-to-app recall with source provenance. A saved wiki summary is not that proof.
- After Apple agreement, `eas submit --platform ios --id 68bb5ceb-098e-4a4b-a7b4-4759163351cf --profile production --non-interactive --wait`.
- Confirm upload, Apple processing and actual TestFlight availability separately.
- Install in place; open Echo → Live Voice and verify speech → real tool → spoken answer → typed follow-up → app close/reopen.
- Complete the remaining design acceptance list before describing this as full capability parity.

Backend rollback source and clinical integrity receipts are private in the existing October 17 backup directory. Restoring the previous server adapter does not require restoring/replacing patient data. App build contains the initial client commit; the artifact-link fix is server-only and compatible with it.
