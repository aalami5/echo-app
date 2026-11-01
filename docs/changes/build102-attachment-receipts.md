# Build 102 — connection truth and attachment receipts

## Diagnosis

The phone's Settings screen used legacy chatStore.isConnected and its Retry
button had no handler. Current voice/chat use the authenticated assistant
adapter. The backend's retired tasks.list RPC caused an unrelated activity
HTTP503/admin-scope error; capability negotiation now skips that optional RPC.

At 2026-11-01 16:25 UTC an app JPEG upload reached the canonical Home session
and the agent described the screenshot, while realtime voice said it had not
received an image. Upload and analysis worked; live provider context and UI
feedback did not reflect those results. No uncertain request is replayed.

## Changes

- Settings performs authenticated bootstrap on focus and Retry, guards stale
  completions, and never treats a generic HTTP landing page as connected.
- Phone distinguishes attached/not sent, server received, review requested,
  ready, interrupted, and unconfirmed. Successful upload acknowledgment gives
  a success haptic before review finishes. Failed uploads preserve drafts.
- Five files maximum, 6 MB per file, 18 MB combined: the latter leaves room
  for base64 expansion below the Gateway's 25 MB RPC frame limit.
- Adapter persists attachment IDs and analysis status alongside existing
  submission receipts; exact-run completion updates status without new work.
- For an active same-conversation call, adapter forwards small receipt/result
  reference packets through its existing server-only call capability. The
  provider acknowledges conversation.item.create. No response.create, tools,
  permissions, session instructions, or duplicate agent turns are invoked.
- Control capability stays in memory until call closure; it is never returned
  to the phone or persisted. Old calls, foreign conversation uploads, failed
  acknowledgments, and result replays cannot generate fresh actions.

## Local integration / deployment

`scripts/install-voice-attachment-context.cjs --check` validates exact installed
2026.10.9 bundle anchors without writing. Install only from the designated
runtime checkout after tests; installation backs up the two modified bundles.
Reload Gateway and app adapter after the current voice call has ended. This
local extension must be revalidated after Gateway upgrades.

Rollback: restore the two exact bundles from the recorded backup, restore
adapter source from its backup, and reload the two services. Do not reset
phone storage, submissions, uploads, or uncertain-send receipts.

Official event reference: https://developers.openai.com/api/docs/guides/realtime-conversations

## Acceptance boundaries

Synthetic tests cover receipt-before-analysis, provider acknowledgment, no
response/tool invocation, deduplication, call/conversation isolation, closed
calls, retained drafts, combined size limits, and Settings Retry. Native build,
signed package, Apple internal availability, live provider acknowledgment,
and physical-phone receipt/audio behavior are separate checks.

### Local worktree export check

When this worktree uses a symlinked `node_modules`, Expo Router can resolve
the dependency owner's app root and export a valid bundle without this app's
screens. Set `EXPO_ROUTER_APP_ROOT` to this checkout's absolute `app` directory
for the local export command, clear Metro's cache, and verify expected UI
markers in the resulting Hermes bundle. Do not commit that machine-specific
path or apply it to EAS. The independently downloaded cloud IPA must contain
the same expected markers; a successful export exit alone is insufficient.

### Verified release evidence

- App source cb2a023, Echo 1.0.0 (102), com.oppersmedical.echo.
- EAS 60666c6a-c6ed-4b49-9906-2ec6327d664e compiled successfully; signed IPA
  identity, code signature, receipt/Retry UI and retained safe-start markers passed.
- Gateway-only follow-up cf4f30b matches the original factory request's
  `gatewayControl`; `clientControl` exists only on the separate broker copy.
- Isolated live provider acknowledged received/completed context, suppressed a
  duplicate receipt, and started zero responses. This is not physical-phone proof.
- Detailed deployment state: workspace `data/echo-attachment102/STATUS.md`.
