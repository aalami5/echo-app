# Build 110: original Gateway Chat restoration

Oliver's November 7 screenshot is the acceptance reference: concentric Echo
avatar, Online status, next-meeting strip, chronological message bubbles with
speaker/time controls, and Photo / Type actions. The separate Live tab remains
leftmost. This corrects build109, whose two routes shared the Live workspace.

## Data and delivery

- Chat mounts `GatewayChatScreen`, not `AssistantWorkspace`. The Live controller
  remains mounted independently so changing tabs does not end a call.
- Normal two-way chat uses the authenticated durable Gateway Home conversation,
  current submission receipts and idempotency keys. No new backend or schedule.
- Full saved briefs/reminders are automatically discovered through bounded Home
  history pages and merged in the default timeline, with no Updates filter.
  Updates have their own retention budget so a busy conversational tail does not
  displace the morning brief. Older history is paged rather than accumulated.
- Old queue-style notifications use a new bounded, separately indexed inbox.
  Body and index writes finish before server queue acknowledgement. APNs preview
  text is never substituted for the full server body. Storage failure preserves
  the pending server copy and notification. Linked pushes fetch the exact saved
  Home message. Cold-start and foreground paths use the same inbox.
- Inbox retains an index of 200 recent notifications; bodies are separate,
  bounded records. Reading is paged (20 rows / 128k characters). Old body files
  are not deleted. iOS metadata preflight applies before storage access.
- Original paused `echo-chat`, clinical/report stores, storage limits, and
  uncertain submission receipts are not cleared, hydrated, or replayed.
- Chat drafts use a distinct key. Uncertain sends disable another submission
  until receipt reconciliation; confirmed receipts clear only the matching
  Chat draft. Photos remain local until explicit Send.

## Verification

Source tests cover original header/timeline, automatic briefs, tab draft
retention, uncertain sends, explicit photo sending, exact notification opens,
cold and foreground notification delivery, write failures, lost ack responses,
bounded pages, and preservation of paused storage. Existing camera, voice,
viewport and storage checks also run.

A read-only production check retrieved today's full saved morning brief and
placed it in the default timeline even alongside 100 newer synthetic turns.
No production message, push, or scheduled digest was sent/replayed for testing.

Release receipts and package checks: workspace `data/echo-gateway-chat110/`.
Native packaging and internal TestFlight access must be verified independently.
Phone appearance, actual tap behavior, and send/receive acceptance remain
pending Oliver's in-place update and check; do not uninstall or clear app data.
