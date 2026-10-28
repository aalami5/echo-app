import React from 'react';
import { View, Text } from 'react-native';
import { useEmailReceiptsStore } from '../stores/emailReceiptsStore';
import { emailReceiptStatus } from '../utils/emailReceiptStatus';

export function ReportEmailStatus({ reportId, report, tracked = false, details = false }: {
  reportId?: string; report: string | null; tracked?: boolean; details?: boolean;
}) {
  const receipts = useEmailReceiptsStore((s) => s.receipts);
  const status = emailReceiptStatus(receipts, reportId, report, tracked);
  if (!report && !status.sent) return null;
  return <View style={{ marginVertical: 8 }} accessibilityLabel={status.label}>
    <Text style={{ color: status.sent ? '#4ade80' : '#94a3b8', fontSize: 13, fontWeight: '600' }}>{status.label}</Text>
    {details && status.latest && <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
      Last emailed {new Date(status.latest.sentAt).toLocaleString()}{'\n'}
      To: {status.latest.recipients.join(', ')}
    </Text>}
  </View>;
}
