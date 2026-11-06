# Build 107 — date default and reliable save/exit

Oliver reported a forced operation-date picker and persistent Not saved/Retry
save prompts, including after finalizing. His screenshots show a genuine saved
state failure; they do not disclose the underlying platform storage exception.
Build106 swallowed that exception. Exact device root cause remains unconfirmed.

## Repairs

- Operation date defaults to the record's device-local creation day, as explicitly
  requested. Never use UTC day or copy another report's operation date. Explicitly
  chosen dates remain unchanged. A selectively opened build106 blank-date draft
  uses its original creation timestamp; generated prose is not rewritten.
- The calendar opens only when the user taps the date; dark native theme and a
  bounded Done button keep manual date editing usable.
- Save report is always visible; review has Save & Close. Errors distinguish
  storage/verification/space/size conditions without displaying private raw errors.
- Each changed case is automatically stored in an independent Documents-directory
  recovery repository, with a bounded per-case file and small metadata index.
  Native UTF8 writes are atomic on iOS (verified in Expo's Swift implementation).
  Save success requires reading back and matching the saved case.
- Original AsyncStorage new-case bytes stay read-only and are merged into listings.
  Opened cases prefer the recovery version once present; an unreadable recovery
  does not silently fall back to an older report. No legacy archive is loaded,
  migrated, deleted or replayed. This is phone-local saving, not a cloud backup.
- Removed redundant screen-level autosave timers; the store already saves every
  change. Finalize/Save & Close navigate only after the save and rendered navigation
  guards settle. Back during saving completes that save before resuming navigation.

## Verification and limits

54 affected tests pass, including real temporary-filesystem persistence/reopen,
broken shared-index isolation, original-byte preservation, failed write/retry,
verification failure, size limits, local date across UTC midnight, and guarded
Save & Close. Component tests retain mocked recording/network/native UI services.
TypeScript passes. Release compilation/package/Apple evidence is recorded separately.

The exact current phone storage exception is not known. Device acceptance is still
required; do not describe source/component checks as an observed phone repair.
Before an in-place update, copy any currently unsaved report text somewhere safe:
updating will close the running app and cannot preserve memory-only unsaved edits.
Never uninstall or clear app storage. No real clinical report/email was used in tests.
