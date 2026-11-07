# Echo 1.0.0 / build 109 — Live, Chat and camera

Based on released build108 source ea06a1b. Existing clinical storage and voice
recovery protections remain unchanged. Internal TestFlight release requested by
Oliver in private WhatsApp on November 7, 2026.

- Bottom destinations begin Live, Chat. A single AssistantScreen controller in
  the tab layout owns drafts, receipts, selected conversation and history; the
  focused route hosts its view through AssistantWorkspaceContext. Do not mount
  separate controllers per tab: that would race shared draft writes/polling.
- Live no longer displays review receipts, review-link or unread-update banners.
  Chat retains receipt/error information and two-way messaging independent of voice.
- Camera uses a centered shutter, flip icon and always-enabled explicit close.
  Closing ignores late capture results and never sends or ends the call. Add and
  Send remain separate actions; leaving camera/route releases the preview.
- Notification links open Chat. Updates reads Home independently of the normal
  recent-message window, scanning at most five sequential pages per action and
  retaining only bounded update cards. Earlier updates continues explicitly.
  This does not replay notifications, change scheduler policy or restore large
  legacy phone caches.

Verification: 50 focused tests initially passed, TypeScript and local iOS bundle
markers passed. Exact current source/check counts and distribution evidence live
in workspace data/echo-live-chat109. Actual production read using the new parser
found today's already-saved morning brief after offsets 0,102,204, retaining three
updates / 7827 content characters. No message was sent for that check.

Phone acceptance remains separate: update in place, verify Live/Chat tabs, camera
close during capture, text-only reply and saved morning brief. Never uninstall
or clear app storage; preserve any currently unsaved report text before updating.
