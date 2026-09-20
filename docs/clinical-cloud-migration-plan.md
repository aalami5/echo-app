# Echo clinical cloud migration — proposed, not deployed

## Recommended target

A dedicated Echo clinical-data project in Oliver's approved healthcare cloud environment, separate from the BeamIt/Abby production databases. If no approved environment exists, select the provider/account and applicable healthcare-data agreement before uploading identifiable data. The present Mac mini is a recovery source, not the final offsite backup strategy.

Use managed PostgreSQL for patient/encounter/report records and an immutable revision table; encrypted object storage for audio/attachments and backups; authenticated API behind HTTPS. Managed secrets/KMS and least-privilege service identities keep keys outside databases and exported archives. Do not ship gateway credentials in a mobile bundle or use the phone number as the patient-data ownership key.

## Authorization and cross-device contract

- Verify the existing signed-in owner's identity server-side. Scope every read/write to that stable account UUID. Reject other users even with a guessed record UUID. Do not carry the current shared gateway bearer into a multi-user service.
- Keep existing patient/report UUIDs on both phones. Bootstrap downloads a manifest before writes; a fresh installation is never treated as an instruction to replace or empty the server.
- Patient/report edits use per-record revisions and idempotency keys. Conflicting revisions retain both versions for review; they are not resolved silently by device clock alone.
- Deletes are explicit, authenticated soft-deletion operations, never inferred from a missing record. Retain prior versions according to the approved policy.
- Persist an encrypted local outbox before displaying a save as backed up. Retry on reconnection/foreground until the server acknowledges that exact revision. Include drafts and separately upload recordings; local file URIs are not backups.
- Show distinct Local only / Uploading / Backed up / Needs attention states and a last successful backup timestamp. Keep a restore action for replacement phones.

## Recovery/migration sequence

1. Keep the old phone unchanged; export/read its local patient and report stores without reinstalling. Capture encrypted recovery snapshots and counts/hashes before any reconciliation.
2. Combine original device records, the 104 saved reports and exact sent-email archive. Reuse original IDs when supported; quarantine ambiguous identity matches. Preserve all source versions. Mark reconstructed details and unknown values honestly.
3. Import into an isolated cloud staging tenant for the verified owner. Reconcile counts, IDs, content hashes, date groups, drafts, sent receipts and media. Never replace the old source in place.
4. Verify with a clean installation, offline edits, restart, network interruption after server acceptance, two-device conflicts, unauthorized-user requests, and disaster restore from independently stored backup plus keys.
5. Enable cloud writes and reads only after reconciliation. Keep the original device and encrypted recovery sources through a documented retention period; do not erase them merely because upload succeeded.

## Backup acceptance

Enable database point-in-time recovery, versioned object backups and independent restricted backup access. Test restoring both data and encryption keys in a clean environment, not just checking that backup jobs report success. Define recovery-time and recovery-point objectives with Oliver; no guarantees are made by the current host-local snapshots.

## Pending decisions

Approved cloud account/provider, healthcare-data hosting requirements, retention policy, and availability of the old iPhone or full device backup. No clinical data has been moved to a new cloud provider by this proposal.
