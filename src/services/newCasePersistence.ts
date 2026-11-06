/** Independent, verified phone-local recovery for new cases only. No legacy archive reads. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { createCaseRepository, CASE_BYTES, CASE_INDEX_KEY, type CaseStorage, type NewCase, type CaseSummary } from './newPatientCases';

export class CasePersistenceError extends Error {
  constructor(public stage: string, public cause?: unknown) { super(`Case save failed: ${stage}`); }
}
export function caseSaveMessage(error: unknown): string {
  const cause = error instanceof CasePersistenceError ? error.cause : error;
  const detail = cause instanceof Error ? cause.message : '';
  if (/too large|full.*list|list is full/i.test(detail)) return 'Not saved: this case or list exceeds the storage limit. Copy your report before reducing attachments. [SIZE_LIMIT]';
  if (/disk full|no space|ENOSPC/i.test(detail)) return 'Not saved: iPhone storage is full. Copy your report, free some space, then tap Save report. [DEVICE_FULL]';
  const stage = error instanceof CasePersistenceError ? error.stage : 'LOCAL_SAVE';
  return `Not saved: the local ${stage === 'VERIFY' ? 'save could not be verified' : 'storage write failed'}. Your report is still open. Copy it, then tap Save report to retry. [${stage}]`;
}
// Expo iOS legacy writeAsStringAsync uses NSString.write(atomically:true).
// Keep recovery in Documents (not purgeable cache), with pre-read byte limits.
export function createCaseFileStorage(fs: typeof FileSystem = FileSystem): CaseStorage {
  const directory = fs.documentDirectory ? `${fs.documentDirectory}echo-new-case-recovery-v1/` : null;
  function path(key: string) {
    if (!directory) throw new CasePersistenceError('DOCUMENTS_UNAVAILABLE');
    if (key !== CASE_INDEX_KEY && !/^echo-new-patient-case-v1-newcase-[a-zA-Z0-9-]{10,100}$/.test(key)) throw Error('Not a new-case recovery key');
    return directory + key + '.json';
  }
  return {
    async getItem(key) {
      const uri = path(key), info = await fs.getInfoAsync(uri);
      if (!info.exists) return null;
      if (info.isDirectory || info.size > (key === CASE_INDEX_KEY ? 2 * 1024 * 1024 : CASE_BYTES)) throw new CasePersistenceError('RECOVERY_READ');
      return fs.readAsStringAsync(uri, { encoding: fs.EncodingType.UTF8 });
    },
    async setItem(key, value) {
      const uri = path(key);
      await fs.makeDirectoryAsync(directory!, { intermediates: true });
      await fs.writeAsStringAsync(uri, value, { encoding: fs.EncodingType.UTF8 });
    },
  };
}
type Repository = ReturnType<typeof createCaseRepository>;
export function createVerifiedCaseRepository(primary: Repository, recovery: Repository) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async list(): Promise<CaseSummary[]> {
      const [a,b] = await Promise.allSettled([primary.list(),recovery.list()]);
      if (a.status === 'rejected' && (b.status === 'rejected' || b.value.length === 0)) throw new CasePersistenceError('LIST_READ');
      if (b.status === 'rejected') throw new CasePersistenceError('RECOVERY_READ');
      const rows = new Map<string,CaseSummary>();
      for (const row of [...(a.status === 'fulfilled' ? a.value : []),...b.value]) {
        const old = rows.get(row.id); if (!old || row.updatedAt >= old.updatedAt) rows.set(row.id,row);
      }
      return [...rows.values()];
    },
    async load(id: string): Promise<NewCase> {
      // Once a case has a recovery entry, do not fall back silently to an older
      // primary copy if the newer recovery file is unreadable.
      const entries = await recovery.list();
      if (entries.some(row=>row.id===id)) return recovery.load(id);
      return primary.load(id);
    },
    save(value: NewCase): Promise<void> {
      // Immutable snapshot; a verified independent copy is authoritative even if
      // AsyncStorage or its index fails. Never delete or replace old archives.
      const raw = JSON.stringify(value), snapshot: NewCase = JSON.parse(raw);
      const operation = queue.catch(()=>{}).then(async()=> {
        try { await recovery.save(snapshot); } catch(error) { throw new CasePersistenceError('RECOVERY_WRITE',error); }
        let saved: NewCase;
        try { saved = await recovery.load(snapshot.dictation.id); } catch(error) { throw new CasePersistenceError('VERIFY',error); }
        if (JSON.stringify(saved) !== raw) throw new CasePersistenceError('VERIFY');
        // Original AsyncStorage bytes are retained read-only. Do not let its
        // failure or stalled writes hold a verified recovery save open.
      });
      queue = operation; return operation;
    },
  };
}
export const caseRepository = createVerifiedCaseRepository(createCaseRepository(AsyncStorage), createCaseRepository(createCaseFileStorage()));
