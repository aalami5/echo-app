import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export interface EmailReceipt {
  id: string;
  reportId?: string;
  linkedReportIds?: string[];
  reportHash: string;
  messageId: string;
  sentAt: string;
  recipients: string[];
  source: string;
}
export const reportHash = (report: string): string =>
  bytesToHex(sha256(utf8ToBytes(report.replace(/\r\n?/g, '\n').trim())));

export function emailReceiptStatus(receipts: EmailReceipt[], reportId: string | undefined, report: string | null, tracked = false) {
  const hash = report ? reportHash(report) : '';
  const history = receipts.filter((r) => (reportId && (r.reportId === reportId || r.linkedReportIds?.includes(reportId))) || (!r.reportId && r.reportHash === hash))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const latest = history[0];
  const updated = !!latest && latest.reportHash !== hash;
  return { latest, history, sent: !!latest, updated,
    label: latest ? (updated ? 'Sent · Updated since last email' : '✓ Sent') : tracked ? 'Not sent' : 'Send history unknown' };
}
