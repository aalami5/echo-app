import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { assistantApi, AssistantMessage, visibleHistory } from './assistant';
import { briefMessageText } from './briefNotification';
import { createNotificationInbox, savePendingNotifications } from './notificationInbox';
import { parseUpdate } from './chatUpdates';
import type { Message } from '../types';
async function preflight(key: string) {
  if (Platform.OS === 'ios' && !await NativeModules?.EchoDiagnosticBridge?.canReadPreview?.(key)) throw new Error('Phone storage could not be checked. Notifications remain saved on the server.');
}
export const notificationInbox = createNotificationInbox({
  async getItem(key) { await preflight(key); return AsyncStorage.getItem(key); },
  async setItem(key, value) { await preflight(key); await AsyncStorage.setItem(key, value); },
});
export function chatMessage(row: AssistantMessage): Message {
  const update = parseUpdate(row);
  return { ...row, content: update ? `${update.title}\n\n${update.body}` : row.content, timestamp: row.timestamp || '' };
}
export async function readLinkedMessage(id: string): Promise<Message> {
  const response = await assistantApi(`/conversations/home/messages/${encodeURIComponent(id)}`);
  const content = briefMessageText(response), row = response.message || response;
  const timestamp = row.timestamp || response.timestamp;
  return chatMessage({ id, role: 'assistant', content, timestamp: timestamp ? new Date(timestamp).toISOString() : undefined });
}
// Discover saved updates independently of the busy conversation's latest page.
export async function readGatewayUpdates(isCurrent = () => true) {
  const found = new Map<string, Message>(); let offset = 0, chars = 0;
  for (let page = 0; page < 8 && isCurrent(); page++) {
    const h = await assistantApi(`/conversations/home/history?offset=${offset}`);
    for (const row of visibleHistory(h.messages || []).reverse()) {
      if (parseUpdate(row) && !found.has(row.id) && chars + row.content.length < 128000) {
        found.set(row.id, chatMessage(row)); chars += row.content.length;
      }
    }
    if (found.size >= 12 || !h.hasMore || !(h.nextOffset > offset)) break;
    offset = h.nextOffset;
  }
  return [...found.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-12);
}
async function queueApi(path: string, body?: unknown) {
  if (!useSettingsStore.persist.hasHydrated()) await useSettingsStore.persist.rehydrate();
  const { gatewayUrl, gatewayToken } = useSettingsStore.getState();
  if (!gatewayUrl || !gatewayToken) throw new Error('Connect Echo in Settings first.');
  const base = gatewayUrl.replace(/^(https?:\/\/[^/?#]+):18789(?=[/?#]|$)/, '$1:18790').replace(/\/+$/, '');
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 20000);
  try {
    const result = await fetch(`${base}/patients/messages/${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: abort.signal,
      headers: { Authorization: `Bearer ${gatewayToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!result.ok) throw new Error(`Notification sync unavailable (${result.status}).`);
    return await result.json();
  } finally { clearTimeout(timer); }
}
let syncing: Promise<unknown> | null = null;
export function syncGatewayNotifications(): Promise<unknown> {
  if (syncing) return syncing;
  syncing = (async () => {
    const pending = await queueApi('pending');
    const rows = (pending.messages || []).slice(0, 200).map((row: any) => ({
      id: row.id, role: 'assistant', content: row.content, timestamp: row.timestamp || new Date().toISOString(), card: row.card,
    }));
    const result = await savePendingNotifications(rows, row => notificationInbox.put(row), ids => queueApi('ack', { messageIds: ids }));
    if (result.failed.length) throw new Error('Some notifications could not be saved yet. Their server copies were kept.');
  })().finally(() => { syncing = null; });
  return syncing;
}
