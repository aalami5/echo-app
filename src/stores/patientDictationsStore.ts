/**
 * Patient Dictations Store — per-patient OR dictations persisted in AsyncStorage.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TranscriptPart } from './dictationStore';
import { usePatientsStore } from './patientsStore';
import { syncFinalizedDictations } from '../services/dictationSync';

export interface PatientDictation {
  id: string;                    // UUID
  patientId: string;             // Links to Patient.id
  status: 'draft' | 'final';    // Draft = in-progress, Final = completed
  dateOfOperation: string;       // ISO date, defaults to today
  transcriptParts: TranscriptPart[];  // Reuse from dictationStore
  selectedProcedures: string[];
  generatedReport: string | null;
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}

interface PatientDictationsState {
  dictations: Record<string, PatientDictation>;
  // Getters
  getDictationsForPatient: (patientId: string) => PatientDictation[];
  // Actions
  createDictation: (patientId: string) => string; // returns dictation ID
  updateDictation: (id: string, updates: Partial<PatientDictation>) => void;
  deleteDictation: (id: string) => void;
  finalizeDictation: (id: string) => void; // sets status to 'final'
}

// Simple UUID generator (no external dependency)
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const getISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatOpDate = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-').map((n) => Number(n));
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const buildHeaderText = (patientName: string, mrn: string, isoDate: string): string => {
  const dateText = formatOpDate(isoDate);
  return `This is Dr. Aalami with a dictated operative report for ${patientName}, medical record number ${mrn}. The date of operation is ${dateText}.`;
};

const syncFinals = (dictations: Record<string, PatientDictation>) => {
  syncFinalizedDictations(dictations).catch((e) => {
    console.log('[PatientDictations] Sync error:', e);
  });
};

export const usePatientDictationsStore = create<PatientDictationsState>()(
  persist(
    (set, get) => ({
      dictations: {},

      getDictationsForPatient: (patientId) => {
        const dictations = Object.values(get().dictations)
          .filter((d) => d.patientId === patientId)
          .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
        return dictations;
      },

      createDictation: (patientId) => {
        const patient = usePatientsStore.getState().patients[patientId];
        const today = getISODate(new Date());
        const now = new Date().toISOString();
        const headerText = buildHeaderText(patient?.name || 'Unknown Patient', patient?.mrn || 'Unknown', today);
        const headerPart: TranscriptPart = {
          id: `${Date.now()}-header`,
          type: 'text',
          content: headerText,
          timestamp: now,
        };

        const id = generateUUID();
        const dictation: PatientDictation = {
          id,
          patientId,
          status: 'draft',
          dateOfOperation: today,
          transcriptParts: [headerPart],
          selectedProcedures: [],
          generatedReport: null,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          dictations: {
            ...state.dictations,
            [id]: dictation,
          },
        }));

        return id;
      },

      updateDictation: (id, updates) => {
        const existing = get().dictations[id];
        if (!existing) return;
        set((state) => ({
          dictations: {
            ...state.dictations,
            [id]: {
              ...existing,
              ...updates,
              updatedAt: new Date().toISOString(),
            },
          },
        }));

        if (existing.status === 'final' || updates.status === 'final') {
          syncFinals(get().dictations);
        }
      },

      deleteDictation: (id) => {
        const existing = get().dictations[id];
        set((state) => {
          const next = { ...state.dictations };
          delete next[id];
          return { dictations: next };
        });

        if (existing?.status === 'final') {
          syncFinals(get().dictations);
        }
      },

      finalizeDictation: (id) => {
        const existing = get().dictations[id];
        if (!existing) return;
        set((state) => ({
          dictations: {
            ...state.dictations,
            [id]: {
              ...existing,
              status: 'final',
              updatedAt: new Date().toISOString(),
            },
          },
        }));

        syncFinals(get().dictations);
      },
    }),
    {
      name: 'patient-dictations-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export const buildPatientDictationHeader = buildHeaderText;
export const formatPatientDictationDate = formatOpDate;
