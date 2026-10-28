import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '../stores/settingsStore';
export type Conversation = { id: string; title: string; project: string };
export type AssistantMessage = { id: string; role: 'user' | 'assistant'; content: string; timestamp?: string; pending?: boolean };
export const newSubmissionId = () => `app_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
export async function assistantApi<T = any>(route: string, body?: unknown): Promise<T> {
  if (!useSettingsStore.persist.hasHydrated()) await useSettingsStore.persist.rehydrate();
  const { gatewayUrl, gatewayToken } = useSettingsStore.getState();
  if (!gatewayUrl || !gatewayToken) throw new Error('Sign in and connect Echo in Settings first.');
  let endpoint = new URL(gatewayUrl).toString();
  // Direct local gateway connections serve the app adapter on its sibling port.
  // React Native's URL has no port setter; only replace the authority's port.
  endpoint = endpoint.replace(/^(https?:\/\/[^/?#]+):18789(?=[/?#]|$)/, '$1:18790');
  // RN 0.81's AbortSignal has no static timeout(). Keep cancellation portable.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(`${endpoint.replace(/\/+$/, '')}/patients/assistant${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${gatewayToken}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (controller.signal.aborted) throw new Error('Request timed out.');
    if (!response.ok) throw new Error(data?.error || `Echo is unavailable (${response.status}).`);
    if (data === null) throw new Error('Echo returned an unreadable response. Please reconnect.');
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Echo took too long to respond. Please reconnect; your saved conversation is unchanged.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function visibleHistory(rows: any[]): AssistantMessage[] {
  return rows.flatMap((row, index) => {
    const m = row.message || row;
    if (!['user', 'assistant'].includes(m.role) || m.channel === 'analysis') return [];
    const content = typeof m.content === 'string' ? m.content : (m.content || []).filter((p: any) => p.type === 'text' || p.type === 'output_text').map((p: any) => p.text || '').join('\n');
    if (!content.trim() || /^(NO_REPLY|HEARTBEAT_OK)$/.test(content.trim())) return [];
    // Native transcript IDs, never content-based deduplication (repeated speech is valid).
    return [{ id: row.__openclaw?.id || m.__openclaw?.id || row.id || row.messageId || m.id || `history-${index}`, role: m.role, content, timestamp: m.timestamp || row.timestamp }];
  });
}
const OUTBOX = 'echo-assistant-outbox-v1';
export type Submission = { id: string; conversationId: string; message: string; attachmentIds: string[]; mode: 'steer' | 'followup'; state: 'pending' | 'uncertain' | 'accepted'; receipt?: any };
let mutation: Promise<unknown> = Promise.resolve();
export async function loadSubmissions(): Promise<Submission[]> { return JSON.parse(await AsyncStorage.getItem(OUTBOX) || '[]'); }
export function saveSubmission(item: Submission): Promise<void> {
  const work = mutation.then(async () => {
    const old = await loadSubmissions(); const i = old.findIndex(s => s.id === item.id);
    if (i < 0) old.push(item); else old[i] = item;
    await AsyncStorage.setItem(OUTBOX, JSON.stringify(old));
  });
  mutation = work.catch(() => {}); return work;
}
export async function submit(item: Submission): Promise<any> {
  await saveSubmission(item);
  try {
    const receipt = await assistantApi(`/conversations/${item.conversationId}/send`, { message: item.message, attachmentIds: item.attachmentIds, mode: item.mode, idempotencyKey: item.id });
    await saveSubmission({ ...item, state: 'accepted', receipt }); return receipt;
  } catch (e) { await saveSubmission({ ...item, state: 'uncertain' }); throw e; }
}
export const ACTIVE_VOICE_KEY = 'echo-assistant-active-voice-v1';
export async function closeAbandonedVoice(): Promise<void> {
  const raw = await AsyncStorage.getItem(ACTIVE_VOICE_KEY); if (!raw) return;
  const v = JSON.parse(raw);
  await assistantApi(`/conversations/${v.conversationId}/voice/${v.voiceSessionId}/close`, {});
  await AsyncStorage.removeItem(ACTIVE_VOICE_KEY);
}
