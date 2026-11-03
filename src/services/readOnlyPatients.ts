// This module deliberately has no clinical store imports or persistence API.
export const PATIENT_METADATA_LIMIT = 2 * 1024 * 1024;
export const PATIENT_RECORD_LIMIT = 5000;
export const HOSPITAL_LABELS = {
  SEQ: 'Sequoia Hospital', ECH: 'El Camino Hospital', SMCMC: 'San Mateo County Medical Center',
  Mills: 'Mills Peninsula', OTHER: 'Other',
};
export type Hospital = keyof typeof HOSPITAL_LABELS;
export type PatientRow = {
  id: string; name: string; mrn: string; dob: string; room: string; chiefComplaint: string;
  hospital: Hospital; callDayId: string; timeSeen: string; date: string; source: 'phone' | 'server';
};
export type Snapshot = { rows: PatientRow[]; removedIds: Set<string> };
export type SourceResult = { status: 'ready'; snapshot: Snapshot; checkedAt: string } |
  { status: 'missing' | 'error'; message: string };
export type PatientView = { local: SourceResult; server: SourceResult };
const invalid = () => new PatientReadError('Patient metadata could not be validated. Saved records were not changed.');
const limitError = () => new PatientReadError('Patient metadata exceeds the safe viewing limit. No records were truncated or changed.');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, required = false): string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > 8192 || (required && !value.trim())) throw invalid();
  return value;
}
export function utf8Bytes(text: string): number {
  // No large temporary byte buffer (Hermes also supports this path).
  let size = 0;
  for (const char of text) { const cp = char.codePointAt(0)!; size += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
  return size;
}
export function parseSnapshot(raw: string, source: 'phone' | 'server'): Snapshot {
  if (raw.length > PATIENT_METADATA_LIMIT || utf8Bytes(raw) > PATIENT_METADATA_LIMIT) throw limitError();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw invalid(); }
  const root = object(parsed);
  if (source === 'phone' && root.version !== undefined && root.version !== 0) throw invalid();
  const data = source === 'phone' ? object(root.state) : root;
  const patients = object(data.patients), days = object(data.callDays);
  if (Object.keys(patients).length > PATIENT_RECORD_LIMIT || Object.keys(days).length > PATIENT_RECORD_LIMIT) throw limitError();
  if (!Array.isArray(data.callDayOrder) || data.callDayOrder.length > PATIENT_RECORD_LIMIT ||
    !data.callDayOrder.every(id => typeof id === 'string' && Object.hasOwn(days, id))) throw invalid();
  const dates = new Map<string, string>();
  for (const [id, value] of Object.entries(days)) {
    const day = object(value);
    if (string(day.id, true) !== id || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
      !Number.isFinite(Date.parse(day.date)) || !Array.isArray(day.patientIds) || day.patientIds.length > PATIENT_RECORD_LIMIT ||
      !day.patientIds.every(pid => typeof pid === 'string')) throw invalid();
    dates.set(id, day.date);
  }
  const removed = data.removedPatientIds ?? [];
  if (!Array.isArray(removed) || removed.length > PATIENT_RECORD_LIMIT || !removed.every(id => typeof id === 'string' && id.length <= 8192)) throw invalid();
  const removedIds = new Set<string>(removed);
  const rows: PatientRow[] = [];
  for (const [id, value] of Object.entries(patients)) {
    const p = object(value), callDayId = string(p.callDayId, true), hospital = string(p.hospital, true);
    if (string(p.id, true) !== id || !Object.hasOwn(HOSPITAL_LABELS, hospital) || !dates.has(callDayId)) throw invalid();
    const row: PatientRow = {
      id, callDayId, hospital: hospital as Hospital, date: dates.get(callDayId)!, source,
      name: string(p.name, true), mrn: string(p.mrn), dob: string(p.dob), room: string(p.room),
      chiefComplaint: string(p.chiefComplaint), timeSeen: string(p.timeSeen),
    };
    if (!removedIds.has(id)) rows.push(row);
  }
  return { rows, removedIds };
}

export function displayedRows(view: PatientView): PatientRow[] {
  const rows = new Map<string, PatientRow>();
  if (view.server.status === 'ready') for (const row of view.server.snapshot.rows) rows.set(row.id, row);
  if (view.local.status === 'ready') {
    // Local edits always win, regardless of server timestamps; never persist this overlay.
    for (const row of view.local.snapshot.rows) rows.set(row.id, row);
    for (const id of view.local.snapshot.removedIds) rows.delete(id);
  }
  if (rows.size > PATIENT_RECORD_LIMIT) throw limitError();
  return [...rows.values()];
}

export function patientSections(rows: PatientRow[], query: string) {
  const search = query.trim().toLocaleLowerCase();
  const groups = new Map<string, { title: string; data: PatientRow[]; date: string; hospital: Hospital }>();
  for (const row of rows) {
    if (search && ![row.name, row.mrn, row.room, row.dob, row.chiefComplaint, row.date, HOSPITAL_LABELS[row.hospital]]
      .some(value => value.toLocaleLowerCase().includes(search))) continue;
    const key = `${row.date}:${row.hospital}`;
    if (!groups.has(key)) groups.set(key, { title: `${row.date} · ${HOSPITAL_LABELS[row.hospital]}`, data: [], date: row.date, hospital: row.hospital });
    groups.get(key)!.data.push(row);
  }
  const order = Object.keys(HOSPITAL_LABELS);
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date) || order.indexOf(a.hospital) - order.indexOf(b.hospital))
    .map(group => ({ ...group, data: group.data.sort((a, b) => b.timeSeen.localeCompare(a.timeSeen) || a.name.localeCompare(b.name)) }));
}

export type ReadDependencies = {
  readLocal: () => Promise<string | null>;
  readServer: (signal: AbortSignal) => Promise<string>;
  localTimeoutMs?: number;
};
function readLocalWithDeadline(deps: ReadDependencies, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error, raw?: string | null) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(raw!);
    };
    const cancel = () => finish(new PatientReadError('Phone metadata refresh cancelled.'));
    const timer = setTimeout(() => finish(new PatientReadError('Phone metadata read timed out. Saved records were not changed.')), deps.localTimeoutMs ?? 5000);
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    // SecureStore has no cancellation API. Late completions are ignored.
    Promise.resolve().then(deps.readLocal).then(raw => finish(undefined, raw), () => finish(new PatientReadError('Phone metadata could not be read. Saved records were not changed.')));
  });
}
export async function readPatientView(deps: ReadDependencies, signal: AbortSignal): Promise<PatientView> {
  async function read(source: 'phone' | 'server'): Promise<SourceResult> {
    try {
      const raw = await (source === 'phone' ? readLocalWithDeadline(deps, signal) : deps.readServer(signal));
      if (signal.aborted) throw new Error('Cancelled');
      if (raw === null) return { status: 'missing', message: 'No saved patient metadata found on this phone.' };
      return { status: 'ready', snapshot: parseSnapshot(raw, source), checkedAt: new Date().toISOString() };
    } catch (error) {
      // Never echo native errors, URLs, payloads, or credentials into the UI/logs.
      return { status: 'error', message: error instanceof PatientReadError ? error.message :
        source === 'phone' ? 'Phone metadata could not be read or validated. Saved records were not changed.' :
          'Server metadata could not be read or validated. Check your connection and try Refresh.' };
    }
  }
  const [local, server] = await Promise.all([read('phone'), read('server')]);
  return { local, server };
}
export class PatientReadError extends Error {}

// XHR is used for React Native download progress, which fetch.text() cannot bound.
// Both announced and actual sizes are checked; no unbounded JSON response parsing.
export function requestPatientMetadata(base: string, token: string, signal: AbortSignal,
  createRequest: () => XMLHttpRequest = () => new XMLHttpRequest()): Promise<string> {
  if (!token) return Promise.reject(new PatientReadError('Connect Echo in Settings to view server patients. Phone records are unchanged.'));
  let url: URL;
  try { url = new URL(base); } catch { return Promise.reject(new PatientReadError('Check the Echo server address in Settings.')); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    return Promise.reject(new PatientReadError('A secure Echo server address is required in Settings.'));
  }
  return new Promise((resolve, reject) => {
    const request = createRequest();
    let finished = false;
    const finish = (error?: Error, raw?: string) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', cancel);
      if (error) { reject(error); request.abort(); } else resolve(raw!);
    };
    const cancel = () => finish(new PatientReadError('Patient refresh cancelled.'));
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    request.open('GET', `${base.replace(/\/+$/, '')}/patients/list`);
    request.timeout = 15000;
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader('Cache-Control', 'no-store');
    request.onreadystatechange = () => {
      if (request.readyState >= 2 && Number(request.getResponseHeader('Content-Length')) > PATIENT_METADATA_LIMIT) {
        finish(new PatientReadError(limitError().message));
      }
    };
    request.onprogress = event => {
      if (event.loaded > PATIENT_METADATA_LIMIT || (event.lengthComputable && event.total > PATIENT_METADATA_LIMIT)) finish(new PatientReadError(limitError().message));
    };
    request.onerror = () => finish(new PatientReadError('Cannot reach the server. Phone records are unchanged. Try Refresh when connected.'));
    request.ontimeout = () => finish(new PatientReadError('Server refresh timed out. Phone records are unchanged. Try Refresh.'));
    request.onabort = cancel;
    request.onload = () => {
      if (request.status === 401 || request.status === 403) return finish(new PatientReadError('Server access was not authorized. Check your connection in Settings.'));
      if (request.status !== 200) return finish(new PatientReadError('The server could not provide patient metadata. Try Refresh.'));
      const raw = request.responseText;
      if (raw.length > PATIENT_METADATA_LIMIT || utf8Bytes(raw) > PATIENT_METADATA_LIMIT) return finish(new PatientReadError(limitError().message));
      finish(undefined, raw);
    };
    request.send();
  });
}

// Single owner for refresh/unmount: stale SecureStore completions cannot repopulate the screen.
export function createPatientReader(deps: ReadDependencies, publish: (view: PatientView) => void) {
  let controller: AbortController | undefined;
  return {
    async refresh() {
      controller?.abort();
      const current = new AbortController(); controller = current;
      const view = await readPatientView(deps, current.signal);
      if (!current.signal.aborted) publish(view);
    },
    cancel() { controller?.abort(); },
  };
}
