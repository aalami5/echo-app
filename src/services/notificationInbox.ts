import type { Message } from '../types';
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
const PREFIX = 'echo-assistant-tail-notification-v110-';
const INDEX = `${PREFIX}index`, MAX_ROWS = 200, MAX_MESSAGE = 65000, MAX_PAGE = 128000;
type Entry = { id: string; timestamp: string };
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(id);
// New bounded records, never the paused echo-chat store. Acknowledgement is
// allowed ONLY after put resolves. Each body is separate from the small index.
export function createNotificationInbox(storage: Storage) {
  let serial: Promise<unknown> = Promise.resolve(), revision = 0;
  const listeners = new Set<() => void>();
  const readIndex = async (): Promise<Entry[]> => {
    const raw = await storage.getItem(INDEX);
    if (raw === null) return [];
    if (raw.length > 50000) throw new Error('Notification index is too large; original data was preserved.');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length > MAX_ROWS || rows.some(r => !validId(r?.id) || typeof r.timestamp !== 'string')) throw new Error('Notification index is unreadable; original data was preserved.');
    return rows;
  };
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    snapshot: () => revision,
    put(message: Message): Promise<void> {
      const work = serial.then(async () => {
        if (!validId(message.id) || message.role !== 'assistant' || !message.content?.trim() || message.content.length > MAX_MESSAGE) throw new Error('Notification could not be saved safely. It remains on the server.');
        const value = JSON.stringify(message);
        if (value.length > MAX_MESSAGE) throw new Error('Notification is too large to save safely.');
        const rows = await readIndex();
        await storage.setItem(PREFIX + 'message-' + message.id, value);
        const next = [...rows.filter(r => r.id !== message.id), { id: message.id, timestamp: message.timestamp }]
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-MAX_ROWS);
        await storage.setItem(INDEX, JSON.stringify(next));
        revision++; listeners.forEach(fn => fn());
      });
      serial = work.catch(() => {}); return work;
    },
    async get(id: string): Promise<Message | null> {
      if (!validId(id)) return null;
      const raw = await storage.getItem(PREFIX + 'message-' + id);
      if (!raw || raw.length > MAX_MESSAGE) return null;
      const row = JSON.parse(raw);
      return row.id === id && row.role === 'assistant' && typeof row.content === 'string' ? row : null;
    },
    async page(offset = 0) {
      const rows = (await readIndex()).reverse(), messages: Message[] = [];
      let chars = 0, cursor = Math.max(0, offset);
      while (cursor < rows.length && messages.length < 20) {
        const raw = await storage.getItem(PREFIX + 'message-' + rows[cursor].id);
        if (raw && raw.length <= MAX_MESSAGE) {
          if (chars + raw.length > MAX_PAGE) break;
          const row = JSON.parse(raw);
          if (row.id === rows[cursor].id && row.role === 'assistant' && typeof row.content === 'string') { messages.push(row); chars += raw.length; }
        }
        cursor++;
      }
      return { messages: messages.reverse(), nextOffset: cursor, hasMore: cursor < rows.length };
    },
  };
}
// A failed write must never consume the only server copy.
export async function savePendingNotifications(rows: Message[], save: (row: Message) => Promise<void>, ack: (ids: string[]) => Promise<unknown>) {
  const saved: string[] = [], failed: string[] = [];
  for (const row of rows) { try { await save(row); saved.push(row.id); } catch { failed.push(row.id); } }
  if (saved.length) await ack([...new Set(saved)]);
  return { saved, failed };
}
