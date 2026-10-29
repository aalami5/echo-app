import { create } from 'zustand';

// Presentation only: no grant or execution authority is stored here.
export const useApprovalUiStore = create<{ visible: boolean; open: () => void; close: () => void }>(set => ({
  visible: false, open: () => set({ visible: true }), close: () => set({ visible: false }),
}));
