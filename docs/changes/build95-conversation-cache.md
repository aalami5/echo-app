# Build 95: conversation cache write correction

## Scope and evidence

The October 25 build93 disk-write resource report records 1126.58 MB of writes over 4347 seconds and a sampled footprint of 1988.69–2518.44 MB. Its action is **none**, so it is not proof of a crash or OS termination. Exact original IPA UUID `1D216916-A89F-348F-8F9E-67C3D3667DE3` maps the sampled application frames, using Objective-C runtime metadata, to `RNCAsyncStorage multiSet:callback:` and `_writeEntry:changedManifest:`. That identifies the native storage path, not the responsible JavaScript key.

Independent screen-level synthetic reproduction confirmed 101 writes of an unchanged 53,141-byte conversation preview over an initial load and 100 polls. The patched same-screen test writes once (53,141 bytes rather than 5,367,241). This is a confirmed write-amplification defect. It does **not** establish that this defect caused the reported launch failure.

## Correction

- Skip a conversation preview write if its serialized value already persisted successfully.
- Serialize writes per conversation, coalesce pending previews, and retry failed writes on a subsequent save without claiming they succeeded.
- Bound tracked previews to eight conversations; do not evict pending writes.
- Limit cached previews to 100 messages and 64 Ki UTF-16 code units (at most 192 KiB UTF-8). Reject oversized data before large JSON serialization; reject oversized/invalid cached data before parsing. Leave oversized legacy caches unchanged rather than deleting or truncating them. Authoritative server history remains unchanged.
- Stop an abandoned cache read from updating a switched/unmounted screen.
- Do not modify conversation source history, drafts, attachments, clinical data, outboxes, uncertain-send receipts, authentication, or backend configuration. No sends are replayed.

## Verification

- 29 targeted cache, actual-screen, attachment, native-client, voice lifecycle/view/orb tests pass.
- TypeScript passes with the existing generated Expo router types. A clean isolated checkout initially lacked those ignored types; no unrelated source fix was needed.
- Native compilation, package inspection, Apple processing and physical-device acceptance are separate stages. Do not call the launch crash fixed solely because these source tests pass.

## Continuing investigation

The supplied video exits during initial `Connecting to Echo` bootstrap, before an established voice call. Source examination finds shared/in-flight-deduplicated restore calls with potentially duplicated subsequent backup work, plus large-data loading paths. These remain hypotheses; no clinical restore changes are included here. Native startup/memory profiling is still needed. A healthy backend or a successful browser/mock test is not a native launch test.

Install any approved TestFlight update in place. Do not uninstall/reset the app to test this fix: local records must be preserved.
