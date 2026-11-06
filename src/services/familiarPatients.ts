/** Bounded phone-local patient metadata. Never reads/writes the legacy report archive. */
import type { Patient } from '../stores/patientsStore';
import type { CaseStorage, CaseSummary } from './newPatientCases';
import { validOperationDate } from './newPatientCases';
import { HOSPITAL_LABELS, PATIENT_METADATA_LIMIT, PATIENT_RECORD_LIMIT, utf8Bytes, type PatientRow } from './readOnlyPatients';
export const PATIENT_VIEW_KEY = 'echo-patient-view-v1';
export type SavedPatient = Patient & { date: string };
export type FamiliarPatient = Omit<PatientRow, 'hospital' | 'source'> & {
  hospital: Patient['hospital'] | null; source: 'phone' | 'server' | 'new'; reports: CaseSummary[]; archived: boolean;
};
const invalid = () => Error('Patient changes could not be read safely. Saved data has not been changed.');
function validate(p: any): asserts p is SavedPatient {
  if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 8192 ||
      !['name','mrn','dob','room','chiefComplaint','callDayId','timeSeen'].every(k => typeof p[k] === 'string' && p[k].length <= 8192) ||
      !p.name.trim() || !p.mrn.trim() || p.name.length > 300 || p.mrn.length > 300 ||
      !Object.hasOwn(HOSPITAL_LABELS, p.hospital) || !validOperationDate(p.date)) throw invalid();
}
function parse(raw: string | null): SavedPatient[] {
  if (raw === null) return [];
  if (raw.length > PATIENT_METADATA_LIMIT || utf8Bytes(raw) > PATIENT_METADATA_LIMIT) throw invalid();
  const value = JSON.parse(raw);
  if (value?.version !== 1 || !Array.isArray(value.patients) || value.patients.length > PATIENT_RECORD_LIMIT) throw invalid();
  value.patients.forEach(validate);
  if (new Set(value.patients.map((p: SavedPatient) => p.id)).size !== value.patients.length) throw invalid();
  return value.patients;
}
export function createPatientViewRepository(storage: CaseStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  const list = async () => parse(await storage.getItem(PATIENT_VIEW_KEY));
  const save = (patient: SavedPatient) => {
    validate(patient);
    const snapshot = { ...patient };
    const operation = queue.catch(() => {}).then(async () => {
      const old = await list();
      const next = [snapshot, ...old.filter(p => p.id !== snapshot.id)];
      const raw = JSON.stringify({ version: 1, patients: next });
      parse(raw);
      await storage.setItem(PATIENT_VIEW_KEY, raw);
    });
    queue = operation;
    return operation;
  };
  return { list, save };
}
export function mergePatientView(legacy: PatientRow[], saved: SavedPatient[], summaries: CaseSummary[]): FamiliarPatient[] {
  const rows = new Map<string, FamiliarPatient>();
  for (const row of legacy) rows.set(row.id, { ...row, archived: true, reports: [] });
  // Summary metadata is enough to list cases; never hydrate reports to draw cards.
  for (const summary of [...summaries].sort((a,b) => a.updatedAt.localeCompare(b.updatedAt))) {
    if (!rows.has(summary.patientId)) {
      const p = summary.patient;
      rows.set(summary.patientId, { id: summary.patientId, name: p?.name ?? summary.name, mrn: p?.mrn ?? summary.mrn,
        dob: p?.dob ?? '', room: p?.room ?? '', chiefComplaint: p?.chiefComplaint ?? '', hospital: p?.hospital ?? null,
        callDayId: p?.callDayId ?? `newday-${summary.date}`, timeSeen: p?.timeSeen ?? summary.updatedAt,
        date: summary.date || p?.timeSeen?.slice(0,10) || summary.updatedAt.slice(0,10), source: 'new', reports: [], archived: false });
    }
    const existing = rows.get(summary.patientId)!;
    if (existing.source === 'new' && summary.patient) {
      Object.assign(existing, summary.patient);
    }
    existing.reports.push(summary);
  }
  for (const p of saved) {
    const previous = rows.get(p.id);
    rows.set(p.id, { ...p, source: 'new', archived: previous?.archived ?? !p.id.startsWith('newpatient-'), reports: previous?.reports ?? [] });
  }
  if (rows.size > PATIENT_RECORD_LIMIT) throw invalid();
  return [...rows.values()].map(p => ({ ...p, reports: p.reports.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)) }));
}
export type PatientListItem = { key: string; kind: 'date'; date: string; count: number } |
  { key: string; kind: 'hospital'; hospital: FamiliarPatient['hospital']; count: number } |
  { key: string; kind: 'patient'; patient: FamiliarPatient };
export function patientListItems(rows: FamiliarPatient[], expanded: Set<string>, query: string): PatientListItem[] {
  const search = query.trim().toLocaleLowerCase();
  const filtered = rows.filter(p => !search || [p.name,p.mrn,p.room,p.dob,p.chiefComplaint,p.date,p.hospital ? HOSPITAL_LABELS[p.hospital] : '']
    .some(s => s.toLocaleLowerCase().includes(search)));
  const result: PatientListItem[] = [];
  const days = new Map<string, FamiliarPatient[]>();
  for (const patient of filtered) {
    if (!days.has(patient.date)) days.set(patient.date, []);
    days.get(patient.date)!.push(patient);
  }
  for (const date of [...days.keys()].sort().reverse()) {
    const day = days.get(date)!;
    result.push({ key: `date-${date}`, kind:'date', date, count:day.length });
    if (!expanded.has(date) && !search) continue;
    for (const hospital of [...Object.keys(HOSPITAL_LABELS), null] as FamiliarPatient['hospital'][]) {
      const group = day.filter(p=>p.hospital===hospital).sort((a,b)=>b.timeSeen.localeCompare(a.timeSeen));
      if (!group.length) continue;
      result.push({ key:`hospital-${date}-${hospital}`, kind:'hospital', hospital, count:group.length });
      for (const patient of group) result.push({ key:`patient-${patient.id}`, kind:'patient', patient });
    }
  }
  return result;
}
