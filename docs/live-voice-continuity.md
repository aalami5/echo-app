# Echo Live Voice continuity

The Chat tab is a voice-first client of the same main Echo agent used by private messaging. The operative-report screens, clinical persistence and report/email functions are not changed.

## Ownership

- Native OpenClaw owns canonical conversation transcripts, run custody, tools, task state, and artifacts. Selected Home/project session identity is shared by typed messages and Live Voice.
- The server adapter owns only a small conversation index, upload provenance, idempotency receipts and archived legacy device history. The phone keeps a recoverable outbox and display cache.
- Audio uses gateway-controlled OpenAI WebRTC. The app sends no provider tool results or fake assistant transcripts; the gateway sideband owns tools and finalized transcripts. Provider credentials never leave the server.
- Ending a call is not a request to cancel accepted work. Explicit stop uses the exact active run. An uncertain acknowledgement never automatically repeats an action.
- Original local chats and the notification inbox remain accessible. Original clinical images remain on the device; upgrade in place, never uninstall to test.

## Runtime requirements

- `server/index.js` must load `assistant-continuity.js`. Authenticated endpoints live under `/patients/assistant`; no arbitrary RPC proxy or caller-selected session keys are exposed.
- Native gateway protocol v4, `talk.client.create` with `gateway-control-v1`, and a configured Platform-key voice provider are required. `talk.catalog` alone does not prove a working voice session.
- Private automatic recall requires BOTH the per-agent `rememberAcrossConversations` setting and the bundled active-memory plugin enabled/allowed. It uses protected same-agent private recall; do not enable unrestricted session search as a workaround. Group/channel recall remains excluded. Other workflows retain their current access policy.
- Configuration and credentials stay outside this repo. Existing approved keychain/env references are reused.

## Checks

```
node --test server/assistant-continuity.test.js tests/clinical-restore-client.test.cjs tests/report-presentation.test.cjs tests/email-receipts-client.test.cjs server/clinical-preservation.test.js server/email-receipts.test.js
npx tsc --noEmit
npx expo export --platform ios
```

Native acceptance must also prove actual SDP/audio, a tool-backed request with an independently checkable result, context retained from typed chat, finalized transcript saved, and text continuation after ending the call. A response saying “Let me check” is not completion. Browser synthetic audio tests must continue sending silence after the utterance so server VAD can close the speech turn.

## Phone acceptance (not replaced by server tests)

1. Upgrade in place; verify existing patients, drafts and notifications remain.
2. Select Home, type a fact, start Live Voice and ask about it.
3. Ask Echo to look up a current project/file; inspect tool-backed result and Activity.
4. Interrupt naturally, mute/unmute, and switch speaker/Bluetooth routes.
5. End the call, close/reopen the app, and continue by text.
6. Ask about a recent private WhatsApp discussion; verify a source-grounded answer rather than guessing.
7. Attach a small PDF/image, request a document, and download/share the artifact.
8. Check earlier-message pagination, connection loss and exact-request reconciliation; do not repeat external actions merely because an acknowledgement was lost.

The memory panel displays curated memory sources and submits remember/correct/forget requests to Echo. It does not pretend that deleting a derived memory fact erases source chat archives or backups. Cross-session summaries remain bounded; recall and current task status are different sources of truth.
