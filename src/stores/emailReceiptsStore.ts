import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmailReceipt } from '../utils/emailReceiptStatus';

type State = {
  receipts: EmailReceipt[];
  merge: (receipts: EmailReceipt[]) => void;
};
export const useEmailReceiptsStore = create<State>()(persist((set) => ({
  receipts: [],
  merge: (receipts) => set((s) => ({ receipts: Array.from(receipts.reduce((map, r) => {
    const previous = map.get(r.id);
    map.set(r.id, { ...r, linkedReportIds: Array.from(new Set([...(previous?.linkedReportIds || []), ...(r.linkedReportIds || [])])) });
    return map;
  }, new Map(s.receipts.map((r) => [r.id, r]))).values()) })),
}), { name: 'operative-email-receipts-v1', storage: createJSONStorage(() => AsyncStorage) }));
