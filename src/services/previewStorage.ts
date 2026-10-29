type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};
// iOS performs metadata-only preflight before AsyncStorage creates a large string.
// A rejected file stays untouched, including by subsequent cache saves.
export function createPreviewStorage(storage: Storage, preflight: (key: string) => Promise<boolean>) {
  const blocked = new Set<string>();
  return {
    async getItem(key: string): Promise<string | null> {
      if (!key.startsWith('echo-assistant-tail-')) throw new Error('Not a preview key');
      let allowed = false;
      try { allowed = await preflight(key); } catch { /* Fail closed for optional previews. */ }
      if (!allowed) { blocked.add(key); return null; }
      return storage.getItem(key);
    },
    async setItem(key: string, value: string): Promise<unknown> {
      if (!key.startsWith('echo-assistant-tail-')) throw new Error('Not a preview key');
      if (blocked.has(key)) return;
      // Check writes too: refresh can finish before the initial preview read.
      let allowed = false;
      try { allowed = await preflight(key); } catch {}
      if (!allowed) { blocked.add(key); return; }
      return storage.setItem(key, value);
    },
  };
}
