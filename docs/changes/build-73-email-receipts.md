# Build 73: operative-report email history

## Behavior

`operative-email-receipts.json` in the existing server DATA_DIR is the authoritative additive delivery ledger. Owner-only file permissions, atomic replacement and fsync; no report bodies, patient names or MRNs. SHA-256 of trimmed, newline-normalized report content identifies the emailed version. Draft/final state is unchanged.

Receipt APIs inherit the existing single-user gateway bearer authentication, fail closed if no server token exists, and disable response caching. `/patients/email-receipts` returns confirmed receipts; `/patients/email-receipts/link` binds exact historical digests to stable report IDs. Device report sync cannot erase or assert receipt history. Old clients still work, with server-side digest-based receipts.

New clients cache confirmed receipts in AsyncStorage. The existing app is single-user; this is not a multi-tenant authorization redesign. Patient-linked report UUIDs are used for stable history; standalone dictation sessions receive separate IDs. Sending reports neither finalizes them nor changes patient answers.

A request ID is retained on device until confirmed; server writes pending intent before Gmail. Same-version initial requests are deduplicated; explicit resend uses a separate persisted request. Unconfirmed delivery stays pending and blocks further sends for that report, rather than risking duplicates. In this case reconcile Sent mail before retrying. Absence from a search is not proof of failure; resolve pending attempts only after verifying provider outcome. Sent means Gmail accepted the message, not recipient read/delivery confirmation.

## Historical reconciliation

Run `node scripts/reconcile-operative-email-history.cjs <private-output-file>` to query Gmail read-only via gog, explicitly using aalami@gmail.com. It stages verified sent-message metadata and exact body digests; it never sends emails or persists email bodies. Search covers app-era operative reports since 2026-02-01. Not every older email necessarily used the current subject/body convention, so unmatched history remains unknown.

Copy the staged file (0600) to DATA_DIR/operative-email-receipts-import.json, then restart com.echo.patient-sync. Startup import is idempotent by Gmail message ID and serialized with server startup; do not write the live ledger from another process. The phone links matching locally held drafts/finals on refresh. Keep the ledger in protected host backups; rollback code must preserve data files.

## Verification and release

- `node --test server/email-receipts.test.js tests/email-receipts-client.test.cjs tests/email-receipts-api.test.cjs`
- `npx tsc --noEmit`
- `npx expo export --platform ios --output-dir <temporary-dir>`
- EAS production build 73, then TestFlight submission. Native app requires installation; backend rollout alone does not change Build 72 UI.
- Test APIs use isolated temporary DATA_DIR and a fake gog executable; no real email sends.

Phone acceptance: open an emailed draft from Patients, verify Sent and date; reopen and restart; edit and verify Updated since last email; check history and multi-report count. Use Resend only when an actual extra email is intended.
