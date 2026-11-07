import type { AssistantMessage } from './assistant';
import { boundedMessages, parseUpdate } from './chatUpdates';

// Search a bounded number of pages, retaining only update cards, not the full
// conversation. A busy Home can put today's brief outside the first 100 rows.
export async function loadUpdatePage(
  fetchPage: (offset: number) => Promise<any>,
  decode: (rows: any[]) => AssistantMessage[],
  startOffset = 0,
  isCurrent = () => true,
) {
  let offset = startOffset;
  for (let page = 0; page < 5 && isCurrent(); page++) {
    const history = await fetchPage(offset);
    if (!isCurrent()) return null;
    const messages = boundedMessages(decode(history.messages || []).filter(row => parseUpdate(row)));
    const nextOffset = Number(history.nextOffset);
    const hasMore = !!history.hasMore && Number.isFinite(nextOffset) && nextOffset > offset;
    offset = hasMore ? nextOffset : offset;
    if (messages.length || !hasMore || page === 4) return { messages, nextOffset: offset, hasMore };
  }
  return null;
}
