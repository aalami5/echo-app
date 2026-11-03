import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type { Patient } from './patientsStore';
import type { PatientDictation } from './patientDictationsStore';
import { createCaseRepository, type NewCase, type CaseSummary, checkCase, summaryOf, validOperationDate } from '../services/newPatientCases';

const repository = createCaseRepository(AsyncStorage);
export function newCaseHeader(name: string, mrn: string, date: string) {
  const display = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `This is Dr. Oliver Aalami with a dictated operative report for ${name}, medical record number ${mrn || 'not specified'}. The date of operation is ${display}.`;
}
type State = {
  patients: Record<string, Patient>; dictations: Record<string, PatientDictation>;
  summaries: CaseSummary[]; saving: boolean; saveError: string | null; savedAt: string | null;
  refresh: () => Promise<void>; open: (id: string) => Promise<void>;
  start: (patient: Omit<Patient, 'id' | 'callDayId' | 'timeSeen'>, date: string) => Promise<string>;
  createDictation: (patientId: string) => string;
  updateDictation: (id: string, updates: Partial<PatientDictation>) => void;
  finalizeDictation: (id: string) => void;
  getDictationsForPatient: (patientId: string) => PatientDictation[];
  retrySave: () => Promise<void>; flush: () => Promise<void>;
};
let pending: Promise<void> = Promise.resolve();
let revision = 0;
let openRevision = 0;
function persistCase(value: NewCase) {
  const current = ++revision;
  useNewPatientCasesStore.setState({ saving: true, saveError: null });
  try { pending = repository.save(value); } catch (error) { pending = Promise.reject(error); }
  // Always handle background saves; keep a rejected pending for explicit flush.
  void pending.then(() => {
    if (current === revision) useNewPatientCasesStore.setState(state => ({ saving: false, savedAt: value.dictation.updatedAt,
      summaries: [summaryOf(value), ...state.summaries.filter(s => s.id !== value.dictation.id)] }));
  }, () => {
    if (current === revision) useNewPatientCasesStore.setState({ saving: false, saveError: 'Not saved. Keep Echo open and tap Retry save. Your last saved copy is unchanged.' });
  });
}
function initialCase(patient: Patient, date: string): NewCase {
  if (!validOperationDate(date)) throw Error('Enter a valid operation date (YYYY-MM-DD).');
  const now = new Date().toISOString(), id = `newcase-${Crypto.randomUUID()}`;
  return { version: 1, patient, dictation: { id, patientId: patient.id, emailTrackingEnabled: true, status: 'draft',
    dateOfOperation: date, transcriptParts: [{ id: `${id}-header`, type: 'text', content: newCaseHeader(patient.name, patient.mrn, date), timestamp: now }],
    selectedProcedures: [], generatedReport: null, createdAt: now, updatedAt: now } };
}
export const useNewPatientCasesStore = create<State>((set, get) => ({
  patients: {}, dictations: {}, summaries: [], saving: false, saveError: null, savedAt: null,
  refresh: async () => { const summaries = await repository.list(); set({ summaries }); },
  open: async id => {
    const request = ++openRevision;
    if (get().dictations[id]) return;
    await pending; // Never replace an unsaved case with another one.
    const value = await repository.load(id);
    if (request !== openRevision) throw Error('A different case was opened.');
    set({ patients: { [value.patient.id]: value.patient }, dictations: { [id]: value.dictation }, savedAt: value.dictation.updatedAt, saveError: null });
  },
  start: async (input, date) => {
    await pending;
    ++openRevision;
    const now = new Date().toISOString();
    const patient: Patient = { ...input, name: input.name.trim(), mrn: input.mrn.trim(), id: `newpatient-${Crypto.randomUUID()}`, callDayId: `newday-${date}`, timeSeen: now };
    const value = initialCase(patient, date); checkCase(value);
    set({ patients: { [patient.id]: patient }, dictations: { [value.dictation.id]: value.dictation }, savedAt: null });
    persistCase(value);
    // Open the case even if the first save fails: the visible Retry save keeps
    // the same case ID and in-memory notes, never generates a duplicate on retry.
    return value.dictation.id;
  },
  createDictation: patientId => {
    if (get().saving || get().saveError) throw Error('Save the current report before starting another.');
    const patient = get().patients[patientId];
    if (!patient) throw Error('Patient not loaded.');
    const date = Object.values(get().dictations)[0]?.dateOfOperation;
    if (!date) throw Error('Choose an operation date first.');
    const value = initialCase(patient, date);
    set({ dictations: { [value.dictation.id]: value.dictation }, savedAt: null }); persistCase(value);
    return value.dictation.id;
  },
  getDictationsForPatient: patientId => Object.values(get().dictations).filter(d => d.patientId === patientId),
  updateDictation: (id, updates) => {
    const existing = get().dictations[id];
    if (!existing) throw Error('This case is no longer open.');
    const dictation = { ...existing, ...updates, id, patientId: existing.patientId, updatedAt: new Date().toISOString() };
    const value: NewCase = { version: 1, patient: get().patients[dictation.patientId], dictation }; checkCase(value);
    set({ dictations: { [id]: dictation } }); persistCase(value);
  },
  finalizeDictation: id => get().updateDictation(id, { status: 'final' }),
  flush: async () => { await pending; },
  retrySave: async () => {
    const dictation = Object.values(get().dictations)[0];
    if (!dictation) return;
    persistCase({ version: 1, patient: get().patients[dictation.patientId], dictation }); await pending;
  },
}));
