# Build 103: recent Home messages and update cards

Personal Chat opens automatically to Home unless a live call is bound to another conversation. Recent gateway history loads on authenticated launch, foreground and reconnect. The live window is capped at 100 messages / 64 Ki characters; older history is paged rather than accumulated. Latest previews use a new `echo-assistant-tail-v103-*` namespace with native metadata preflight and the existing bounded/coalesced cache writer. Legacy chat/clinical recovery remains paused; original stores and uncertain-send outbox are unchanged.

Canonical Home updates render expandable cards, read markers, an Updates filter and a new-update button in Live Voice. Discussion prepares an explicit draft referencing the saved message; it never auto-sends or interrupts a call. Linked notifications fetch the exact authenticated Home message. Daily access-failure notices are marked needs-attention. Dictate is hidden from the main tab bar but remains in More; its records and workflow are not deleted.

Workspace delivery producers are separate from this release: `echo_update_delivery.py` uses the existing persist/read-back/linked-push machinery. Quiet results receive no push. Existing legacy receipt ledgers and uncertain outcomes remain intact. Scheduler changes and source-access results are recorded in workspace `data/echo-chat103/`.

Verification: focused UI/history/cache/voice/safe-start tests and TypeScript. Release, signed package, scheduled execution and physical-device evidence must be recorded independently. An available TestFlight build does not prove installed-phone behavior. Update in place; do not clear retained data.
