/**
 * Dictation Store — Zustand store for OR dictation state
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

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

interface DictationState {
  transcriptParts: TranscriptPart[];
  generatedReport: string | null;
  isGenerating: boolean;
  currentProcedureType: string | null;
  editingCorrections: string | null;

  corrections: CorrectionEntry[];
  stylePreferences: StylePreference[];
  savedExamples: SavedExample[];

  addTranscriptPart: (part: TranscriptPart) => void;
  removeTranscriptPart: (id: string) => void;
  clearSession: () => void;
  setGeneratedReport: (report: string | null) => void;
  setIsGenerating: (v: boolean) => void;
  setCurrentProcedureType: (t: string | null) => void;
  setEditingCorrections: (c: string | null) => void;
  addCorrection: (correction: CorrectionEntry) => void;
  addStylePreference: (pref: StylePreference) => void;
  saveAsExample: (report: string, procedureType: string) => void;
  loadPersistedData: () => Promise<void>;
}

const CORRECTIONS_KEY = 'dictation_corrections';
const STYLE_PREFS_KEY = 'dictation_style_prefs';
const EXAMPLES_KEY = 'dictation_examples';

async function persistData(key: string, data: any) {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(data));
  } catch (e) {
    console.warn('[DictationStore] Failed to persist', key, e);
  }
}

async function loadData<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[DictationStore] Failed to load', key, e);
    return null;
  }
}

export const useDictationStore = create<DictationState>((set, get) => ({
  transcriptParts: [],
  generatedReport: null,
  isGenerating: false,
  currentProcedureType: null,
  editingCorrections: null,
  corrections: [],
  stylePreferences: [],
  savedExamples: [],

  addTranscriptPart: (part) =>
    set((s) => ({ transcriptParts: [...s.transcriptParts, part] })),

  removeTranscriptPart: (id) =>
    set((s) => ({ transcriptParts: s.transcriptParts.filter((p) => p.id !== id) })),

  clearSession: () =>
    set({
      transcriptParts: [],
      generatedReport: null,
      isGenerating: false,
      currentProcedureType: null,
      editingCorrections: null,
    }),

  setGeneratedReport: (report) => set({ generatedReport: report }),
  setIsGenerating: (v) => set({ isGenerating: v }),
  setCurrentProcedureType: (t) => set({ currentProcedureType: t }),
  setEditingCorrections: (c) => set({ editingCorrections: c }),

  addCorrection: (correction) => {
    const corrections = [...get().corrections, correction];
    set({ corrections });
    persistData(CORRECTIONS_KEY, corrections);
  },

  addStylePreference: (pref) => {
    const stylePreferences = [...get().stylePreferences, pref];
    set({ stylePreferences });
    persistData(STYLE_PREFS_KEY, stylePreferences);
  },

  saveAsExample: (report, procedureType) => {
    const example: SavedExample = {
      id: Date.now().toString(),
      procedureType,
      report,
      timestamp: new Date().toISOString(),
    };
    const savedExamples = [...get().savedExamples, example];
    set({ savedExamples });
    persistData(EXAMPLES_KEY, savedExamples);
  },

  loadPersistedData: async () => {
    const [corrections, stylePreferences, savedExamples] = await Promise.all([
      loadData<CorrectionEntry[]>(CORRECTIONS_KEY),
      loadData<StylePreference[]>(STYLE_PREFS_KEY),
      loadData<SavedExample[]>(EXAMPLES_KEY),
    ]);
    set({
      corrections: corrections || [],
      stylePreferences: stylePreferences || [],
      savedExamples: savedExamples || [],
    });
  },
}));
