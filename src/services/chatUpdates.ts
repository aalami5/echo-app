import type { AssistantMessage } from './assistant';

export const MAX_RECENT_MESSAGES = 100;
export const MAX_RECENT_CHARS = 64 * 1024;
export const UPDATE_READ_KEY = 'echo-update-read-v103';
export type UpdateCard = { title: string; summary: string; kind: string; priority: string; body: string };

// Bound the live window too, not just persisted previews. Never reopen old stores.
export function boundedMessages(rows: AssistantMessage[]): AssistantMessage[] {
  const result: AssistantMessage[] = []; let chars = 0;
  for (const row of rows.slice(-MAX_RECENT_MESSAGES).reverse()) {
    if (!row || typeof row.id !== 'string' || typeof row.content !== 'string') continue;
    const size = row.id.length + row.content.length;
    if (size > MAX_RECENT_CHARS || chars + size > MAX_RECENT_CHARS) break;
    result.unshift(row); chars += size;
  }
  return result;
}
export function mergeRecent(old: AssistantMessage[], incoming: AssistantMessage[]): AssistantMessage[] {
  const map = new Map(old.map(row => [row.id, row]));
  incoming.forEach(row => map.set(row.id, row));
  return boundedMessages([...map.values()]);
}
export function parseUpdate(message: AssistantMessage): UpdateCard | null {
  if (message.role !== 'assistant') return null;
  const text = message.content;
  const labelled = text.replace(/^\[[a-zA-Z0-9_-]{1,240}\]\s*\n/, '');
  const match = labelled.match(/^<!-- echo-update:(.{1,2400}) -->\s*\n/);
  if (match) {
    try {
      const m = JSON.parse(match[1]);
      if (m.version !== 1 || typeof m.title !== 'string' || typeof m.summary !== 'string'
        || m.title.length > 160 || m.summary.length > 300
        || !['normal','useful','urgent'].includes(m.priority)
        || !['update','brief','reminder','attention'].includes(m.kind)) return null;
      return { ...m, body: labelled.slice(match[0].length) };
    } catch { return null; }
  }
  const legacy = text.match(/^\[(morning-brief|daily-email-review|end-of-day|morning-delivery-check|eod-delivery-check)-[^\]]+\]\s*\n/);
  if (!legacy) return null;
  const body = text.slice(legacy[0].length);
  const attention = /^AUTOMATION_FAILED\b/.test(body.trim());
  const title = legacy[1] === 'daily-email-review' ? 'Email review' : legacy[1] === 'end-of-day' ? 'End of day' : legacy[1].includes('check') ? 'Delivery check' : 'Morning brief';
  return { title: title + (attention ? ' · needs attention' : ''), summary: attention ? 'Some sources could not be checked. Open for coverage and next steps.' : 'Saved in Echo Home', kind: attention ? 'attention' : 'brief', priority: 'normal', body: body.replace(/^AUTOMATION_FAILED\s*/, '') };
}
export function decodeReadIds(raw: string | null): string[] {
  if (!raw || raw.length > 32000) return [];
  try { const ids = JSON.parse(raw); return Array.isArray(ids) ? ids.filter(x => typeof x === 'string' && x.length <= 128).slice(-200) : []; } catch { return []; }
}
