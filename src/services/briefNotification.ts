// Push payloads supply identifiers only; message text comes from authenticated
// Home history, never from an arbitrary URL or a retained phone cache.
export const OPENED_BRIEF_KEY = 'echo-opened-brief-v1';
export function linkedBriefId(data: unknown): string | null {
  const value = data as Record<string, unknown> | null;
  return value?.conversationId === 'home' && typeof value.chatMessageId === 'string'
    && /^[a-zA-Z0-9_-]{1,128}$/.test(value.chatMessageId)
    ? value.chatMessageId : null;
}

export function briefMessageText(response: any): string {
  if (response?.available === false) throw new Error('This saved brief is unavailable. Please refresh Home.');
  const row = response?.message || response;
  if (row?.role !== 'assistant') throw new Error('The saved brief could not be verified.');
  const text = typeof row.content === 'string' ? row.content
    : (Array.isArray(row.content) ? row.content.filter((p: any) => p.type === 'text' || p.type === 'output_text').map((p: any) => p.text || '').join('\n') : '');
  if (!text.trim() || text.length > 65000) throw new Error('The saved brief is unavailable or too large to open safely.');
  return text;
}
