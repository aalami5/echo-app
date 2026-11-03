/** New cases only. Never opens, migrates, or writes the legacy clinical archive. */
import type { Patient } from '../stores/patientsStore';
import type { PatientDictation } from '../stores/patientDictationsStore';
import { HOSPITAL_LABELS, utf8Bytes } from './readOnlyPatients';

export const CASE_INDEX_KEY = 'echo-new-patient-cases-v1';
export const CASE_PREFIX = 'echo-new-patient-case-v1-';
export const CASE_BYTES = 8 * 1024 * 1024;
export const CASE_COUNT = 500;
export type NewCase = { version: 1; patient: Patient; dictation: PatientDictation };
export type CaseSummary = { id: string; patientId: string; name: string; mrn: string; date: string; updatedAt: string; status: 'draft' | 'final' };
export type CaseStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
const invalid = () => Error('This new case could not be read safely. Saved data has not been replaced.');
const validId = (id: unknown): id is string => typeof id === 'string' && /^newcase-[a-zA-Z0-9-]{10,100}$/.test(id);
const text = (value: unknown, max = 8192): value is string => typeof value === 'string' && value.length <= max;
export function validOperationDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function checkCase(value: any): asserts value is NewCase {
  const p = value?.patient, d = value?.dictation;
  if (value?.version !== 1 || !p || !d || !validId(d.id) || !text(p.id, 200) || !p.id || d.patientId !== p.id ||
      !text(p.name, 300) || !p.name.trim() || !text(p.mrn, 300) || !text(p.dob) || !text(p.room) ||
      !text(p.chiefComplaint) || !Object.hasOwn(HOSPITAL_LABELS, p.hospital) || !text(p.callDayId) || !text(p.timeSeen) ||
      !validOperationDate(d.dateOfOperation) || !['draft', 'final'].includes(d.status) ||
      !text(d.createdAt, 100) || !text(d.updatedAt, 100) ||
      !Array.isArray(d.transcriptParts) || d.transcriptParts.length > 500 ||
      !d.transcriptParts.every((part: any) => part && text(part.id, 200) && ['text', 'voice', 'image'].includes(part.type) &&
        text(part.content, 200000) && text(part.timestamp, 100) && (part.imageBase64 === undefined || text(part.imageBase64, CASE_BYTES)) &&
        (part.ocrText === undefined || text(part.ocrText, 200000))) ||
      !Array.isArray(d.selectedProcedures) || d.selectedProcedures.length > 200 || !d.selectedProcedures.every((v: unknown) => text(v, 1000)) ||
      !(d.generatedReport === null || text(d.generatedReport, 500000))) throw invalid();
}
export function summaryOf(value: NewCase): CaseSummary {
  const { patient: p, dictation: d } = value;
  return { id: d.id, patientId: p.id, name: p.name, mrn: p.mrn, date: d.dateOfOperation, updatedAt: d.updatedAt, status: d.status };
}
function parseIndex(raw: string | null): CaseSummary[] {
  if (raw === null) return [];
  if (raw.length > 2 * 1024 * 1024 || utf8Bytes(raw) > 2 * 1024 * 1024) throw invalid();
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.cases) || data.cases.length > CASE_COUNT ||
      !data.cases.every((v: any) => v && validId(v.id) && text(v.patientId, 200) && text(v.name, 300) && text(v.mrn, 300) &&
        validOperationDate(v.date) && text(v.updatedAt, 100) && ['draft', 'final'].includes(v.status)) ||
      new Set(data.cases.map((v: CaseSummary) => v.id)).size !== data.cases.length) throw invalid();
  return data.cases;
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
    if (raw.length > CASE_BYTES || utf8Bytes(raw) > CASE_BYTES) throw Error('This case is too large to save safely. Your last saved copy is unchanged. Keep Echo open and reduce large attachments.');
    const summary = summaryOf(value);
    const operation = queue.catch(() => {}).then(async () => {
      const index = await list();
      const existing = index.findIndex(item => item.id === summary.id);
      if (existing < 0) {
        if (index.length >= CASE_COUNT) throw Error('The new-case list is full. No saved case was removed.');
        // Reserve discovery BEFORE writing the case. An interrupted initial write
        // is shown explicitly on reopen; completed case bytes never become orphaned.
        index.unshift(summary);
        await storage.setItem(CASE_INDEX_KEY, JSON.stringify({ version: 1, cases: index }));
      }
      await storage.setItem(CASE_PREFIX + summary.id, raw);
      const next = index.map(item => item.id === summary.id ? summary : item);
      await storage.setItem(CASE_INDEX_KEY, JSON.stringify({ version: 1, cases: next }));
    });
    queue = operation;
    return operation;
  };
  return { list, load, save };
}
