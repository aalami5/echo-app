# Build 108 — report attachment storage

Build 107 classified an 8 MiB combined-record limit as SIZE_LIMIT. Several
photos could exhaust that budget even when the device had available disk space.

New-case recovery now stores imageBase64 losslessly in content-addressed files
under Documents/echo-new-case-images-v1, with SHA-256 and length verification.
The bounded v1 case file stores references in the same field; the repository
rehydrates them before returning the record to the existing UI/OCR workflow.
No compression, source/OCR/report truncation, or automatic attachment deletion.

Limits: 8 MiB per image, 64 MiB total image data for one selectively opened case,
8 MiB report metadata, 2 MiB list metadata, 500 new cases. These are application
resource limits, distinct from ENOSPC/device full. Images are not read for lists.
Old inline new-case records remain readable; only a case explicitly saved is
converted. Original AsyncStorage records remain read-only. Legacy archives,
backend activation, backup settings, receipts and pending sends are untouched.

Commit ordering: all sidecars are written atomically and read/hash verified
before the existing repository writes the case manifest. A fresh load then
verifies every image and compares the complete record before Saved. Missing or
corrupt sidecars fail explicitly instead of returning stale primary content.
Retry can restore a corrupt sidecar from hash-matching content still in memory.
No garbage collection is introduced. New manifests require build 108 or later.

Tests use synthetic data and temporary disk files. An 11 MiB image case fails
the old serializer, saves with the new repository, and reopens byte-for-byte
through a fresh repository. Tests also cover prior inline storage, deduplication,
ENOSPC, corrupted writes, retry, missing/tampered images, traversal and allocation
bounds, and preservation of previous manifest/original stores.

Device acceptance remains separate: preserve unsaved text before updating in
place; never uninstall/clear data. Verify Save & Close, reopen, and an app restart
on the affected phone. Existing memory-only edits cannot survive installing an
update unless the user copies them first.
