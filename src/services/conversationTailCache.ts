import type { AssistantMessage } from './assistant';

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};
type Entry = {
  persisted?: string;
  pending?: string;
  writing?: Promise<void>;
  revision: number;
};

// This is a disposable preview, not the authoritative transcript, draft, or outbox.
// A UTF-16 character cap also bounds UTF-8 storage (at most 3 bytes per code unit).
export const MAX_TAIL_CHARS = 64 * 1024;
export const MAX_TAIL_MESSAGES = 100;
const MAX_TRACKED_CONVERSATIONS = 8;
const keyFor = (id: string) => `echo-assistant-tail-${id}`;

function isMessage(value: unknown): value is AssistantMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as AssistantMessage;
  return typeof m.id === 'string' && ['user', 'assistant'].includes(m.role)
    && typeof m.content === 'string'
    && (m.timestamp === undefined || typeof m.timestamp === 'string');
}

function encode(messages: AssistantMessage[]): string | null {
  if (!Array.isArray(messages) || messages.length > MAX_TAIL_MESSAGES) return null;
  // Reject oversized inputs before JSON.stringify allocates another large string.
  let chars = 0;
  for (const m of messages) {
    if (!isMessage(m)) return null;
    chars += m.id.length + m.content.length + (m.timestamp?.length || 0);
    if (chars > MAX_TAIL_CHARS) return null;
  }
  const raw = JSON.stringify(messages.map(m => ({
    id: m.id, role: m.role, content: m.content, timestamp: m.timestamp,
  })));
  return raw.length <= MAX_TAIL_CHARS ? raw : null;
}

export function createConversationTailCache(storage: Storage) {
  const entries = new Map<string, Entry>();
  const getEntry = (id: string): Entry | undefined => {
    let entry = entries.get(id);
    if (entry) {
      entries.delete(id); entries.set(id, entry);
      return entry;
    }
    if (entries.size >= MAX_TRACKED_CONVERSATIONS) {
      const idle = [...entries].find(([, value]) => !value.writing && value.pending === undefined);
      if (!idle) return undefined; // Never evict an in-flight write or grow without bound.
      entries.delete(idle[0]);
    }
    entry = { revision: 0 };
    entries.set(id, entry);
    return entry;
  };

  return {
    async read(id: string): Promise<AssistantMessage[]> {
      const entry = getEntry(id), revision = entry?.revision;
      const raw = await storage.getItem(keyFor(id));
      // Keep an oversized/invalid legacy file untouched; fetch authoritative history.
      if (!raw || raw.length > MAX_TAIL_CHARS) return [];
      let messages: unknown;
      try { messages = JSON.parse(raw); } catch { return []; }
      if (!Array.isArray(messages) || messages.length > MAX_TAIL_MESSAGES || !messages.every(isMessage)) return [];
      if (entry && entry.revision === revision && !entry.writing && entry.pending === undefined) {
        entry.persisted = raw;
      }
      return messages;
    },
    save(id: string, messages: AssistantMessage[]): Promise<void> {
      const raw = encode(messages);
      if (raw === null) return Promise.resolve(); // Do not truncate source messages or replace a good cache.
      const entry = getEntry(id);
      if (!entry) return Promise.resolve();
      entry.revision++;
      entry.pending = raw; // Coalesce queued previews; never queue every polling snapshot.
      if (entry.writing) return entry.writing;
      const drain = async () => {
        while (entry.pending !== undefined) {
          const value = entry.pending;
          entry.pending = undefined;
          if (value === entry.persisted) continue;
          try {
            await storage.setItem(keyFor(id), value);
            entry.persisted = value; // Failed writes must remain retryable.
          } catch (error) {
            if (entry.pending === undefined) entry.pending = value;
            throw error;
          }
        }
      };
      entry.writing = drain().finally(() => { entry.writing = undefined; });
      return entry.writing;
    },
  };
}
