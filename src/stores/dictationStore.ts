/**
 * Dictation Store — Zustand store for OR dictation state
 * 
 * Uses AsyncStorage for persistence (custom procedures, corrections, examples).
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProcedureCategory } from '../data/vascularProcedures';

export interface TranscriptPart {
  id: string;
  type: 'voice' | 'text' | 'image';
  content: string;
  imageBase64?: string;
  imageMimeType?: string;
  timestamp: string;
}

export interface CorrectionEntry {
  id: string;
  original: string;
  corrected: string;
  context: string;
  timestamp: string;
}

export interface StylePreference {
  id: string;
  section: string;
  preference: string;
  timestamp: string;
}

export interface SavedExample {
  id: string;
  procedureType: string;
  report: string;
  timestamp: string;
}

export interface CustomProcedure {
  id: string;
  name: string;
  category: ProcedureCategory;
  /** Optional template text learned from previous reports */
  template?: string;
  createdAt: string;
}

interface DictationPersistedState {
  corrections: CorrectionEntry[];
  stylePreferences: StylePreference[];
  savedExamples: SavedExample[];
  customProcedures: CustomProcedure[];
}

interface DictationSessionState {
  transcriptParts: TranscriptPart[];
  generatedReport: string | null;
  isGenerating: boolean;
  selectedProcedures: string[]; // array of procedure names (tags)
  editingCorrections: string | null;
}

interface DictationActions {
  addTranscriptPart: (part: TranscriptPart) => void;
  removeTranscriptPart: (id: string) => void;
  clearSession: () => void;
  setGeneratedReport: (report: string | null) => void;
  setIsGenerating: (v: boolean) => void;
  toggleProcedure: (name: string) => void;
  setSelectedProcedures: (procs: string[]) => void;
  setEditingCorrections: (c: string | null) => void;
  addCorrection: (correction: CorrectionEntry) => void;
  addStylePreference: (pref: StylePreference) => void;
  saveAsExample: (report: string, procedureType: string) => void;
  addCustomProcedure: (proc: CustomProcedure) => void;
  updateCustomProcedure: (id: string, updates: Partial<CustomProcedure>) => void;
  removeCustomProcedure: (id: string) => void;
}

type DictationState = DictationPersistedState & DictationSessionState & DictationActions;

export const useDictationStore = create<DictationState>()(
  persist(
    (set, get) => ({
      // Persisted state
      corrections: [],
      stylePreferences: [],
      savedExamples: [],
      customProcedures: [],

      // Session state (not persisted — reset on app restart)
      transcriptParts: [],
      generatedReport: null,
      isGenerating: false,
      selectedProcedures: [],
      editingCorrections: null,

      // Actions
      addTranscriptPart: (part) =>
        set((s) => ({ transcriptParts: [...s.transcriptParts, part] })),

      removeTranscriptPart: (id) =>
        set((s) => ({ transcriptParts: s.transcriptParts.filter((p) => p.id !== id) })),

      clearSession: () =>
        set({
          transcriptParts: [],
          generatedReport: null,
          isGenerating: false,
          selectedProcedures: [],
          editingCorrections: null,
        }),

      setGeneratedReport: (report) => set({ generatedReport: report }),
      setIsGenerating: (v) => set({ isGenerating: v }),

      toggleProcedure: (name) =>
        set((s) => {
          const exists = s.selectedProcedures.includes(name);
          return {
            selectedProcedures: exists
              ? s.selectedProcedures.filter((p) => p !== name)
              : [...s.selectedProcedures, name],
          };
        }),

      setSelectedProcedures: (procs) => set({ selectedProcedures: procs }),
      setEditingCorrections: (c) => set({ editingCorrections: c }),

      addCorrection: (correction) =>
        set((s) => ({ corrections: [...s.corrections, correction] })),

      addStylePreference: (pref) =>
        set((s) => ({ stylePreferences: [...s.stylePreferences, pref] })),

      saveAsExample: (report, procedureType) => {
        const example: SavedExample = {
          id: Date.now().toString(),
          procedureType,
          report,
          timestamp: new Date().toISOString(),
        };
        set((s) => ({ savedExamples: [...s.savedExamples, example] }));
      },

      addCustomProcedure: (proc) =>
        set((s) => ({ customProcedures: [...s.customProcedures, proc] })),

      updateCustomProcedure: (id, updates) =>
        set((s) => ({
          customProcedures: s.customProcedures.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      removeCustomProcedure: (id) =>
        set((s) => ({
          customProcedures: s.customProcedures.filter((p) => p.id !== id),
        })),
    }),
    {
      name: 'dictation-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist these keys
      partialize: (state) => ({
        corrections: state.corrections,
        stylePreferences: state.stylePreferences,
        savedExamples: state.savedExamples,
        customProcedures: state.customProcedures,
      }),
    }
  )
);
