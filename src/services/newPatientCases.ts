/** New cases only. Never opens, migrates, or writes the legacy clinical archive. */
import type { Patient } from '../stores/patientsStore';
import type { PatientDictation } from '../stores/patientDictationsStore';
import { HOSPITAL_LABELS, utf8Bytes } from './readOnlyPatients';

export const CASE_INDEX_KEY = 'echo-new-patient-cases-v1';
export const CASE_PREFIX = 'echo-new-patient-case-v1-';
export const CASE_BYTES = 16 * 1024 * 1024;
export const IMAGE_BYTES = 24 * 1024 * 1024;
export const CASE_INDEX_BYTES = 16 * 1024 * 1024;
export const CASE_COUNT = 5000;
export class CaseLimitError extends Error {
  constructor(public code: 'REPORT_SIZE_LIMIT' | 'CASE_LIST_LIMIT', message: string) { super(message); }
}
export type NewCase = { version: 1; patient: Patient; dictation: PatientDictation; saveId?: string; textCheckpointId?: string; textRecovery?: boolean };
// Clone mutable metadata, but share immutable image strings instead of creating
// several full base64 copies during every keystroke/save/readback.
export function caseMetadata(value: NewCase): string {
  return JSON.stringify({ ...value, dictation: { ...value.dictation, transcriptParts: value.dictation.transcriptParts.map(p => ({ ...p, imageBase64: p.imageBase64 === undefined ? undefined : '' })) } });
}
export function snapshotCase(value: NewCase): NewCase {
  const snapshot: NewCase = JSON.parse(caseMetadata(value));
  snapshot.dictation.transcriptParts.forEach((p, i) => { if (value.dictation.transcriptParts[i].imageBase64 !== undefined) p.imageBase64 = value.dictation.transcriptParts[i].imageBase64; });
  return snapshot;
}
export function sameCase(a: NewCase, b: NewCase): boolean {
  return caseMetadata(a) === caseMetadata(b) && a.dictation.transcriptParts.every((p, i) => p.imageBase64 === b.dictation.transcriptParts[i].imageBase64);
}
export type CaseSummary = { id: string; patientId: string; name: string; mrn: string; date: string; updatedAt: string; status: 'draft' | 'final'; patient?: Patient; hasContent?: boolean };
export type CaseStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
const invalid = () => Error('This new case could not be read safely. Saved data has not been replaced.');
const validId = (id: unknown): id is string => typeof id === 'string' && /^newcase-[a-zA-Z0-9-]{10,100}$/.test(id);
const text = (value: unknown, max = 8192): value is string => typeof value === 'string' && value.length <= max;
export function validOperationDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function localOperationDate(createdAt: string | Date = new Date()): string {
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  if (!Number.isFinite(date.getTime())) throw Error('Invalid record creation date.');
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
// Build106 drafts may lack dates; retain readability and fill only the opened case.
function validCaseDate(date: unknown, status: unknown): boolean {
  return typeof date === 'string' && (validOperationDate(date) || (date === '' && status === 'draft'));
}
export function checkCase(value: any): asserts value is NewCase {
  const p = value?.patient, d = value?.dictation;
  if (value?.version !== 1 || !p || !d || !validId(d.id) || !text(p.id, 200) || !p.id || d.patientId !== p.id ||
      !text(p.name, 300) || !p.name.trim() || !text(p.mrn, 300) || !text(p.dob) || !text(p.room) ||
      !text(p.chiefComplaint) || !Object.hasOwn(HOSPITAL_LABELS, p.hospital) || !text(p.callDayId) || !text(p.timeSeen) ||
      !validCaseDate(d.dateOfOperation, d.status) || !['draft', 'final'].includes(d.status) ||
      !text(d.createdAt, 100) || !text(d.updatedAt, 100) ||
      !Array.isArray(d.transcriptParts) || d.transcriptParts.length > 500 ||
      !d.transcriptParts.every((part: any) => part && text(part.id, 200) && ['text', 'voice', 'image'].includes(part.type) &&
        text(part.content, 200000) && text(part.timestamp, 100) && (part.imageBase64 === undefined || text(part.imageBase64, IMAGE_BYTES)) &&
        (part.imageMissing === undefined || typeof part.imageMissing === 'boolean') &&
        (part.ocrText === undefined || text(part.ocrText, 200000))) ||
      !Array.isArray(d.selectedProcedures) || d.selectedProcedures.length > 200 || !d.selectedProcedures.every((v: unknown) => text(v, 1000)) ||
      !(d.generatedReport === null || text(d.generatedReport, 500000))) throw invalid();
}
export function summaryOf(value: NewCase): CaseSummary {
  const { patient: p, dictation: d } = value;
  return { id: d.id, patientId: p.id, name: p.name, mrn: p.mrn, date: d.dateOfOperation, updatedAt: d.updatedAt, status: d.status, patient: { ...p }, hasContent: !!d.generatedReport || d.transcriptParts.some(part => part.id !== `${d.id}-header`) };
}
function parseIndex(raw: string | null): CaseSummary[] {
  if (raw === null) return [];
  if (raw.length > CASE_INDEX_BYTES || utf8Bytes(raw) > CASE_INDEX_BYTES) throw invalid();
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.cases) || data.cases.length > CASE_COUNT ||
      !data.cases.every((v: any) => v && validId(v.id) && text(v.patientId, 200) && text(v.name, 300) && text(v.mrn, 300) &&
        validCaseDate(v.date, v.status) && text(v.updatedAt, 100) && ['draft', 'final'].includes(v.status) &&
        (v.hasContent === undefined || typeof v.hasContent === 'boolean') &&
        (v.patient === undefined || (v.patient.id === v.patientId && text(v.patient.name, 300) && text(v.patient.mrn, 300) &&
          text(v.patient.dob) && text(v.patient.room) && text(v.patient.chiefComplaint) && Object.hasOwn(HOSPITAL_LABELS, v.patient.hospital) &&
          text(v.patient.callDayId) && text(v.patient.timeSeen)))) ||
      new Set(data.cases.map((v: CaseSummary) => v.id)).size !== data.cases.length) throw invalid();
  return data.cases;
}
function encodeIndex(cases: CaseSummary[]) {
  const raw = JSON.stringify({ version: 1, cases });
  parseIndex(raw); // Validate the enriched metadata budget BEFORE any write.
  return raw;
}
export function createCaseRepository(storage: CaseStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  const list = async () => parseIndex(await storage.getItem(CASE_INDEX_KEY));
  const load = async (id: string): Promise<NewCase> => {
    if (!validId(id)) throw invalid();
    const raw = await storage.getItem(CASE_PREFIX + id);
    if (!raw || raw.length > CASE_BYTES || utf8Bytes(raw) > CASE_BYTES) throw invalid();
    const value = JSON.parse(raw); checkCase(value);
    if (value.dictation.id !== id) throw invalid();
    return value;
  };
  const save = (value: NewCase): Promise<void> => {
    // Snapshot before queuing; later edits cannot mutate an in-flight save.
    checkCase(value);
    const raw = JSON.stringify(value);
    if (raw.length > CASE_BYTES || utf8Bytes(raw) > CASE_BYTES) throw new CaseLimitError('REPORT_SIZE_LIMIT', 'This case is too large to save safely. Your last saved copy is unchanged.');
    const summary = summaryOf(value);
    const operation = queue.catch(() => {}).then(async () => {
      const index = await list();
      const existing = index.findIndex(item => item.id === summary.id);
      if (existing < 0 && index.length >= CASE_COUNT) throw new CaseLimitError('CASE_LIST_LIMIT', 'The new-case list is full. No saved case was removed.');
      const nextIndex = existing < 0 ? [summary, ...index] : index.map(item => item.id === summary.id ? summary : item);
      encodeIndex(nextIndex);
      if (existing < 0) {
        // Reserve discovery BEFORE writing the case. An interrupted initial write
        // is shown explicitly on reopen; completed case bytes never become orphaned.
        index.unshift(summary);
        await storage.setItem(CASE_INDEX_KEY, encodeIndex(index));
      }
      await storage.setItem(CASE_PREFIX + summary.id, raw);
      const next = index.map(item => item.id === summary.id ? summary : item);
      await storage.setItem(CASE_INDEX_KEY, encodeIndex(next));
    });
    queue = operation;
    return operation;
  };
  return { list, load, save };
}
