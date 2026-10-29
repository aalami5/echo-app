// Fixed labels only: never send storage keys, values, identifiers or errors to diagnostics.
const labels = new Set(['echo-chat', 'patient-dictations-store', 'dictation-store',
  'operative-email-receipts-v1', 'echo-assistant-outbox-v1']);
function category(key) {
  if (typeof key !== 'string') return 'other';
  if (labels.has(key)) return key;
  if (key.startsWith('echo-assistant-tail-')) return 'conversation-preview';
  if (key.startsWith('echo-assistant-draft-')) return 'conversation-draft';
  return 'other';
}
function installStartupStorageProbe(storage, bridge) {
  if (!bridge?.storageRead || storage.__echoStartupProbe) return;
  let remaining = 80;
  const mark = (key, phase, length) => {
    if (remaining-- <= 0) return;
    try { bridge.storageRead(category(key), phase, length); } catch {}
  };
  const get = storage.getItem.bind(storage);
  storage.getItem = (key, callback) => {
    mark(key, 'requested', 0);
    // Observe via the native completion callback, before the caller parses the value.
    return get(key, (error, value) => {
      mark(key, error ? 'failed' : 'completed', typeof value === 'string' ? value.length : 0);
      callback?.(error, value);
    });
  };
  Object.defineProperty(storage, '__echoStartupProbe', { value: true });
}
module.exports = { installStartupStorageProbe, category };
