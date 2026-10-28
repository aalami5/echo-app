import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEmailReceiptsStore } from '../stores/emailReceiptsStore';
import { useSettingsStore } from '../stores/settingsStore';
import { reportHash, EmailReceipt } from '../utils/emailReceiptStatus';
import { usePatientDictationsStore } from '../stores/patientDictationsStore';
import type { GatewayService } from './gateway';

let refreshInFlight: Promise<void> | null = null;
export function refreshEmailReceipts(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const { gatewayUrl, gatewayToken } = useSettingsStore.getState();
    if (!gatewayUrl || !gatewayToken) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${gatewayUrl.replace(/\/+$/, '')}/patients/email-receipts`, {
        headers: { Authorization: `Bearer ${gatewayToken}` }, signal: controller.signal,
      });
      if (!response.ok) throw new Error('Email history unavailable');
      const data = await response.json();
      if (!Array.isArray(data.receipts)) throw new Error('Invalid email history');
      useEmailReceiptsStore.getState().merge(data.receipts);
      // Bind exact historical matches to stable IDs BEFORE a later edit changes the hash.
      if (!usePatientDictationsStore.persist.hasHydrated()) await usePatientDictationsStore.persist.rehydrate();
      const receipts = data.receipts as EmailReceipt[];
      const links = Object.values(usePatientDictationsStore.getState().dictations).filter((d) => d.generatedReport)
        .map((d) => ({ reportId: d.id, reportHash: reportHash(d.generatedReport!) }))
        .filter((link) => receipts.some((r) => !r.reportId && r.reportHash === link.reportHash && !r.linkedReportIds?.includes(link.reportId)));
      if (links.length) {
        // Preserve known matches offline too, even if the server link request fails.
        useEmailReceiptsStore.getState().merge(receipts.map((r) => ({ ...r, linkedReportIds: Array.from(new Set([
          ...(r.linkedReportIds || []), ...links.filter((l) => !r.reportId && l.reportHash === r.reportHash).map((l) => l.reportId)
        ])) })));
        const linked = await fetch(`${gatewayUrl.replace(/\/+$/, '')}/patients/email-receipts/link`, {
          method: 'POST', headers: { Authorization: `Bearer ${gatewayToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ links: links.slice(0, 1000) }), signal: controller.signal,
        });
        if (linked.ok) useEmailReceiptsStore.getState().merge((await linked.json()).receipts);
      }
    } finally { clearTimeout(timer); }
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

const sending = new Set<string>();
export async function sendReportWithReceipt(gateway: GatewayService, report: string, reportId?: string, resend = false) {
  const id = reportId || `standalone-${reportHash(report)}`;
  if (sending.has(id)) return;
  sending.add(id);
  // Retain the same request ID after timeout/restart, including explicit resends.
  const key = `operative-email-attempt:${id}:${reportHash(report)}`;
  try {
    let requestId = await AsyncStorage.getItem(key);
    if (!requestId) {
      requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      await AsyncStorage.setItem(key, requestId);
    }
    const result = await gateway.sendOperativeReportEmail(report, undefined, { reportId: id, requestId, resend });
    if (!result.success || !result.receipt) throw new Error('Email receipt is not confirmed. Refresh history before retrying.');
    useEmailReceiptsStore.getState().merge([result.receipt]);
    await AsyncStorage.removeItem(key);
  } finally {
    sending.delete(id);
    refreshEmailReceipts().catch(() => {}); // Never clear cached history when offline.
  }
}
