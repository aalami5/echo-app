import type { Message } from '../types';
// Reserve space for notifications before conversational traffic. A busy day
// must not evict the morning brief merely by filling the latest history page.
export function gatewayTimeline(history: Message[], notifications: Message[], pending: Message[] = []): Message[] {
  const selected = new Map<string, Message>(); let chars = 0;
  for (const group of [notifications.slice(-32), pending.slice(-10), history.slice(-100)]) {
    for (const row of [...group].reverse()) {
      if (selected.has(row.id) || row.content.length > 65000 || chars + row.content.length > 192000) continue;
      selected.set(row.id, row); chars += row.content.length;
    }
  }
  return [...selected.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
}
