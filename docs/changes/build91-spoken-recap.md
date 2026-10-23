# Build 91 — automatic spoken recap

## Behavior

An intentional personal voice connection gets one interruptible 35–60-word recap,
at most three topics: needs attention, newly completed tasks, recent discussion.
Existing startup memory is read before provider creation. Current task claims use
fresh read-only task snapshots, not assistant promises or old notes. Unknown or
stale status is explicit. Empty task lists never imply all work is finished.

The browser waits for both the data channel and peer connection. The native app
sends one authenticated readiness acknowledgement after WebRTC connects. No
greeting is queued before that acknowledgement. Speaking first, an existing
response, closing, or a continuity reset suppresses it. Provider VAD interrupts
audio; the recap is not resumed. Transient reconnects and screen remounts reuse
the same call and do not greet again. A deliberate new call may greet again.

The recap uses an out-of-band response with no tools and `tool_choice: none`.
No user request is injected, no agent is started, no historical actions replayed.
Only owner-private startup sources qualify; groups, other users, patient workflow
sessions and sensitive snippets are excluded. Checkpoints store only bounded call
IDs and timestamps in `data/assistant/voice-recap-state.json`, not transcripts.
Ordinary conversation history and memory files are not rewritten.

## Deployment

The server change is backwards-compatible with Build 90 (silent startup remains).
Build 91 supplies the new native media-readiness acknowledgement. The OpenClaw
browser receives a matching readiness-gated client hook.

`node scripts/install-voice-recap.cjs --check` validates exact installed bundle
anchors. `node scripts/install-voice-recap.cjs` backs up and patches the shared
Talk request, OpenAI bridge factory and broker, plus browser bootstrap. This is
a local integration, not an upstream OpenClaw capability. Gateway upgrades must
revalidate both startup-memory and recap integrations. Restart the gateway and
patient-sync adapter after installation. No clinical routes or saved data change.

Rollback: restore only the gateway bundle files listed in the dated backup
manifest; remove the newly added browser module only if the manifest says it did
not exist; revert this release's server adapter changes; restart services. Do not
restore clinical data, credentials, conversation index, or memory files. Build 91
fails open to ordinary audio if the older server has no readiness route.

## Verification

Targeted tests cover read-only scope, newer task status, stale data, sensitivity,
duplicate claims, durable checkpoints, speech before readiness, interruption,
late readiness, browser media/channel ordering, authenticated call ownership,
native screen remounts and transient reconnects. Physical iPhone audio acceptance
must be reported separately from browser and mocked lifecycle tests.

Implementation references: official OpenAI documentation,
https://developers.openai.com/api/docs/guides/voice-server-controls and
https://developers.openai.com/api/docs/guides/realtime-conversations .
