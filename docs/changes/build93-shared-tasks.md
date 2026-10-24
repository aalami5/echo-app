# Build 93 — shared private task records and Live Voice visibility

## Scope
Owner-private task registry shared between Echo app conversations and Oliver's direct WhatsApp. SQLite WAL transactions enforce stable task keys, resource claims, version checks, immutable terminal history and durable action receipts. Existing OpenClaw task/run records are read-only projections; a run finishing is explicitly not proof of an external action completing. No old request or background job is restarted by viewing it.

Voice UI: active tasks below the avatar, collapse and Show all history, task context and a Discuss action that prepares text without sending it. The microphone retains its slash and gains a faded red bubble (#663F49), distinct from Hang up (#9F2835). The browser Talk integration uses its authenticated RPC client and read-only task snapshots. Native features require updating the app in place.

## Enforcement and limits
- Private session allowlist excludes groups, unrelated users and clinical session keys. This is the existing single-owner installation, not a multi-tenant security boundary.
- Agent tool hooks require a claimed task before executing non-lookup tools. Code-mode orchestration itself is exempt; nested tools remain gated by the host. Missing registry/claim fails closed.
- Exact canonical task keys deduplicate across channels. Different wording requires the assistant to inspect the shared snapshot; no claim of perfect semantic duplicate detection.
- Resources are named by the assistant; overlapping resource names serialize work. Independent resources can proceed in parallel. No unbounded automatic agent spawning is introduced.
- Stable irreversible-action receipts prevent reuse. Native direct message sends get additional automatic argument-fingerprint receipts. Arbitrary shell/browser/provider effects still require correct action registration and external verification; this is NOT universal exactly-once execution.
- Turn endings and gateway restarts mark unfinished claimed work Needs review and retain resource locks. Reconciliation is explicit; no timer silently retries or steals a lock.
- Source-linked context is stored privately, not raw message bodies or secrets. Existing run titles may originate from user text. Do not use the owner view on shared/group displays.
- Old observed records are read-only and can lack action detail. Coverage failures show stale/unavailable, not an empty success state.
- Existing native subagent records are visible where their authoritative owner matches an allowed source. Cross-agent child claims beyond owner sessions are not automatically granted.

## Verification before release
88 targeted/backend tests passed, including the recent voice-session-cleanup regressions, plus task registry concurrency/dedup/restart and UI state coverage. TypeScript and iOS export passed. Browser test and actual deployment results recorded below when verified. Physical iPhone audio/layout acceptance remains separate.

## Deployment
Pending. Browser asset integration is version-checked and backed up. Plugin configuration changes must merge existing allowlists and enable conversation-access hooks only for this reviewed plugin. Backend LaunchAgent must preserve the currently deployed voice cleanup fix, existing environment and clinical storage. No clinical data migration.
