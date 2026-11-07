# Build 108 — report attachment storage

Build 107 classified an 8 MiB combined-record limit as SIZE_LIMIT. Several
photos could exhaust that budget even when the device had available disk space.

New-case recovery now stores imageBase64 losslessly in content-addressed files
under Documents/echo-new-case-images-v1, with SHA-256 and length verification.
The bounded v1 case file stores references in the same field; the repository
rehydrates them before returning the record to the existing UI/OCR workflow.
No compression, source/OCR/report truncation, or automatic attachment deletion.

Limits: 24 MiB per image, 128 MiB total image data for one selectively opened case,
16 MiB report metadata, 16 MiB list metadata, 5000 new cases. These are application
resource limits, distinct from ENOSPC/device full. Images are not read for lists.
Old inline new-case records remain readable; only a case explicitly saved is
converted. Original AsyncStorage records remain read-only. Legacy archives,
backend activation, backup settings, receipts and pending sends are untouched.

Commit ordering: all sidecars are written atomically and read/hash verified
before the existing repository writes the case manifest. A fresh load then
verifies every image and compares the complete record before Saved. Missing or
corrupt sidecars fall back to the verified text checkpoint with explicit missing-image markers, never stale primary content.
Retry can restore a corrupt sidecar from hash-matching content still in memory.
No garbage collection is introduced. New manifests require build 108 or later.

Tests use synthetic data and temporary disk files. A 71 MiB image case (including a 17 MiB image) fails
the old serializer, saves with the new repository, and reopens byte-for-byte
through a fresh repository. Tests also cover prior inline storage, deduplication,
ENOSPC, corrupted writes, retry, missing/tampered images, traversal and allocation
bounds, and preservation of previous manifest/original stores.

Device acceptance remains separate: preserve unsaved text before updating in
place; never uninstall/clear data. Verify Save & Close, reopen, and an app restart
on the affected phone. Existing memory-only edits cannot survive installing an
update unless the user copies them first.

## Text-first recovery (November 7 refinement)

Before writing images, the repository atomically writes and reads back a separate
text-only checkpoint under Documents/echo-new-case-text-v1. It contains full
report text, source notes, OCR and review metadata; photos are marked missing,
never presented as successfully saved. Lists include checkpoint-only cases.
Reopening a failed complete save exposes the latest checkpoint and TEXT_RECOVERED.
A save identity links complete records to the checkpoint they supersede, avoiding
stale text recovery after a successful full save whose text-copy write failed.
Missing-photo placeholders must be explicitly reattached/removed before a whole
case can be marked saved. A still-open case can retry its original image bytes.

Metadata-only snapshots share immutable image strings, avoiding full base64 JSON
copies on every save. True disk exhaustion can still prevent even a text write;
only a successfully read-back checkpoint is described as protected. Nothing here
guarantees persistence on a physically full or failing device.

Verification: 65 affected source/component/temporary-filesystem tests and TypeScript
pass. Recovery from View Report offers Review missing images and preserves report
text while restoring access to photo controls. Native/TestFlight/device evidence
is tracked separately in the release artifacts.
