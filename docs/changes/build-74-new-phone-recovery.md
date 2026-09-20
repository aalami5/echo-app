# Build 74 — new-phone recovery and overwrite protection

## Incident

The patient client uploaded full installation-local snapshots but had no download/restore path. Mount/rehydration cleanup also uploaded empty state. The legacy backend replaced its entire patient file on every upload. Logs show 219 patient entries/117 date groups followed by empty uploads. This is not phone-number-based patient storage. Report sync previously included only finalized reports.

## Immediate preservation and recovery

- Protected, owner-only pre-change snapshots made on the existing host. Never commit clinical data or keys.
- Legacy patient and report uploads now merge; omitted records are not deletions. Prior snapshots are retained before atomic/fsynced replacement. Stale report revisions do not replace newer ones.
- Current patient/report files and new history snapshots use AES-256-GCM. Production key is outside the data directory at `~/.config/echo-app/clinical-storage.key`, configured through `CLINICAL_KEY_FILE` in the existing patient-sync service. Same authenticated routes; no-store responses.
- Missing/corrupt encrypted data fails closed. Do not roll back to a plaintext-only reader; decrypt into a protected staging location with the retained key first if rollback is needed.
- `scripts/recover-patient-headers.cjs DATA_DIR` previews deterministic reconstruction; `--apply` restores only missing patient UUIDs with consistent exact app-generated headers. 102 entries recovered from 104 saved reports. Reports unchanged. Unknown hospital/DOB/room/concern remain blank/Other and entries are labeled as recovered. Dates group by operation date, not a claim to recover original encounter dates.
- 155 email receipts are separate and unchanged. Historical private snapshots remain protected recovery artifacts; at-rest encryption of the current database does not retroactively imply every preexisting host file is encrypted.

## Native client

- Restore missing patient and report records on authenticated launch/foreground, and through Patients → Restore saved cases. Reads both datasets before applying either. Existing local records/edits are never overwritten.
- This is additive recovery, **not a complete multi-device conflict-resolution protocol**. Existing records already present on another phone are not automatically overwritten with remote revisions. Deliberate removals are hidden locally; server history remains recoverable on a new installation.
- Draft and final report text now use the durable report outbox; patient snapshots retry on launch/foreground. Audio/media file URIs are not uploaded as transferable recordings.
- Remove unsolicited date-reorganization uploads on empty mount/hydration. Empty patient uploads are skipped. Do not clear a newer queued upload when an older request completes.
- Add-patient handles an absent/stale date group, expands the saved group, clears a filter hiding the new case, retains the form on errors, and provides an explicit empty-state Add patient button. The user's exact phone-specific failure has not been reproduced.

## Limitations and follow-up

- Recovery is partial until the old iPhone or a complete device backup is checked. 219 former patient entries are not equivalent to 104 saved reports. Unsynced drafts/recordings may exist only on the old device.
- Existing backend remains on Oliver's Mac mini via HTTPS tunnel. No managed-cloud clinical data deployment or offsite backup was configured in this release. Choose an approved clinical-data environment, verify authorization/retention/encryption/key recovery, and test restore before calling that migration complete.
- Keep the encryption key in independent protected backup with a tested recovery procedure. Ciphertext without its key cannot be restored. Current host-local snapshots alone do not protect against host loss.
- Native changes require installation of Build 74; backend protection is effective for old builds immediately. Verify Add patient and restore on the actual new iPhone before declaring the incident fully resolved.

## Tests

`node --test server/clinical-preservation.test.js tests/clinical-api.test.cjs tests/clinical-restore-client.test.cjs server/email-receipts.test.js tests/email-receipts-api.test.cjs tests/email-receipts-client.test.cjs`

TypeScript and iOS production bundle export. Synthetic tests cover empty/partial upload preservation, encrypted history, restart/decryption, authorization, malformed/failed restore, local-edit preservation, drafts, and adding with a stale date reference. No real patient was added for tests; no real emails sent.
