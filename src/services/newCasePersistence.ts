/** Independent, verified phone-local recovery for new cases only. No legacy archive reads. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { createCaseRepository, CaseLimitError, CASE_BYTES, CASE_INDEX_BYTES, CASE_INDEX_KEY, snapshotCase, sameCase, type CaseStorage, type NewCase, type CaseSummary } from './newPatientCases';
import { createAttachmentCaseRepository, CaseAttachmentError } from './caseAttachments';

export class CasePersistenceError extends Error {
  constructor(public stage: string, public cause?: unknown, public textProtected = false) { super(`Case save failed: ${stage}`); }
}
export const TEXT_RECOVERY_MESSAGE = 'Report text and notes recovered on this phone. The complete case is not saved. Reattach missing images or remove their placeholders, then tap Save report. [TEXT_RECOVERED]';
export function caseSaveMessage(error: unknown): string {
  if (error instanceof CasePersistenceError && error.textProtected) {
    return 'Report text and notes are protected on this phone. The complete case is not saved. ' + caseSaveMessage(new CasePersistenceError(error.stage, error.cause));
  }
  const cause = error instanceof CasePersistenceError ? error.cause : error;
  const detail = cause instanceof Error ? cause.message : '';
  if (cause instanceof CaseLimitError) return cause.code === 'CASE_LIST_LIMIT'
    ? 'Not saved: the new-case list is at its capacity. Your open report is unchanged; copy it somewhere safe. [CASE_LIST_LIMIT]'
    : 'Not saved: the report text and review data exceed the per-report limit; this does not mean your iPhone is full. Copy your report somewhere safe. [REPORT_SIZE_LIMIT]';
  if (cause instanceof CaseAttachmentError && cause.stage === 'ATTACHMENT_MISSING') return TEXT_RECOVERY_MESSAGE;
  if (cause instanceof CaseAttachmentError) return cause.stage === 'ATTACHMENT_LIMIT'
    ? 'Not saved: the attachments exceed the supported size or format. Your open report is unchanged; copy it somewhere safe. [ATTACHMENT_LIMIT]'
    : `Not saved: an attached image could not be saved and verified. Keep this report open, copy its text, then retry. [${cause.stage}]`;
  if (/disk full|no space|ENOSPC/i.test(detail)) return 'Not saved: iPhone storage is full. Copy your report, free some space, then tap Save report. [DEVICE_FULL]';
  const stage = error instanceof CasePersistenceError ? error.stage : 'LOCAL_SAVE';
  return `Not saved: the local ${stage === 'VERIFY' ? 'save could not be verified' : 'storage write failed'}. Your report is still open. Copy it, then tap Save report to retry. [${stage}]`;
}
// Expo iOS legacy writeAsStringAsync uses NSString.write(atomically:true).
// Keep recovery in Documents (not purgeable cache), with pre-read byte limits.
export function createCaseFileStorage(fs: typeof FileSystem = FileSystem, kind: 'complete' | 'text' = 'complete'): CaseStorage {
  const directory = fs.documentDirectory ? `${fs.documentDirectory}${kind === 'text' ? 'echo-new-case-text-v1' : 'echo-new-case-recovery-v1'}/` : null;
  function path(key: string) {
    if (!directory) throw new CasePersistenceError('DOCUMENTS_UNAVAILABLE');
    if (key !== CASE_INDEX_KEY && !/^echo-new-patient-case-v1-newcase-[a-zA-Z0-9-]{10,100}$/.test(key)) throw Error('Not a new-case recovery key');
    return directory + key + '.json';
  }
  return {
    async getItem(key) {
      const uri = path(key), info = await fs.getInfoAsync(uri);
      if (!info.exists) return null;
      if (info.isDirectory || info.size > (key === CASE_INDEX_KEY ? CASE_INDEX_BYTES : CASE_BYTES)) throw new CasePersistenceError('RECOVERY_READ');
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
export function createVerifiedCaseRepository(primary: Repository, recovery: Repository, textCopies?: Repository) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async list(): Promise<CaseSummary[]> {
      const [a,b,c] = await Promise.allSettled([primary.list(),recovery.list(),textCopies?.list() ?? Promise.resolve([])]);
      if (c.status === 'rejected') throw new CasePersistenceError('TEXT_READ');
      if (a.status === 'rejected' && (b.status === 'rejected' || b.value.length === 0) && c.value.length === 0) throw new CasePersistenceError('LIST_READ');
      if (b.status === 'rejected') throw new CasePersistenceError('RECOVERY_READ');
      const rows = new Map<string,CaseSummary>();
      for (const row of [...(a.status === 'fulfilled' ? a.value : []),...b.value,...c.value]) {
        const old = rows.get(row.id); if (!old || row.updatedAt >= old.updatedAt) rows.set(row.id,row);
      }
      return [...rows.values()];
    },
    async load(id: string): Promise<NewCase> {
      // Once a case has a recovery entry, do not fall back silently to an older
      // primary copy if the newer recovery file is unreadable.
      const textEntries = textCopies ? await textCopies.list() : [];
      const checkpoint = textEntries.some(row => row.id === id) ? await textCopies!.load(id) : null;
      if (checkpoint && (!checkpoint.textRecovery || !checkpoint.saveId)) throw new CasePersistenceError('TEXT_READ');
      try {
        const entries = await recovery.list();
        const complete = await (entries.some(row=>row.id===id) ? recovery.load(id) : primary.load(id));
        // Matching write identity proves the full record is the version whose
        // text was checkpointed. Otherwise expose the newer protected text.
        if (checkpoint && checkpoint.saveId !== (complete.textCheckpointId ?? complete.saveId)) return checkpoint;
        return complete;
      } catch (error) {
        if (checkpoint) return checkpoint;
        throw error;
      }
    },
    save(value: NewCase): Promise<void> {
      // Immutable snapshot; a verified independent copy is authoritative even if
      // AsyncStorage or its index fails. Never delete or replace old archives.
      const snapshot = snapshotCase(value);
      delete snapshot.textRecovery;
      if (textCopies) { snapshot.saveId = Crypto.randomUUID(); delete snapshot.textCheckpointId; }
      const operation = queue.catch(()=>{}).then(async()=> {
        let textProtected = false;
        if (textCopies) {
          const text = snapshotCase(snapshot);
          text.textRecovery = true;
          for (const part of text.dictation.transcriptParts) {
            if (part.imageBase64) { delete part.imageBase64; part.imageMissing = true; }
          }
          try {
            await textCopies.save(text);
            textProtected = sameCase(await textCopies.load(text.dictation.id), text);
          } catch { /* A text-copy failure alone must not block a full save. */ }
          try {
            // A successful full save supersedes whichever checkpoint currently
            // exists, even if this particular checkpoint write failed. Never
            // reopen an older text copy over that successful newer full save.
            const currentText = await textCopies.load(snapshot.dictation.id);
            if (currentText.textRecovery && currentText.saveId) snapshot.textCheckpointId = currentText.saveId;
          } catch { /* No readable checkpoint to supersede. */ }
        }
        try { await recovery.save(snapshot); } catch(error) { throw new CasePersistenceError('RECOVERY_WRITE',error,textProtected); }
        let saved: NewCase;
        try { saved = await recovery.load(snapshot.dictation.id); } catch(error) { throw new CasePersistenceError('VERIFY',error,textProtected); }
        if (!sameCase(saved, snapshot)) throw new CasePersistenceError('VERIFY',undefined,textProtected);
        // Original AsyncStorage bytes are retained read-only. Do not let its
        // failure or stalled writes hold a verified recovery save open.
      });
      queue = operation; return operation;
    },
  };
}
export const caseRepository = createVerifiedCaseRepository(createCaseRepository(AsyncStorage), createAttachmentCaseRepository(createCaseRepository(createCaseFileStorage())), createCaseRepository(createCaseFileStorage(FileSystem, 'text')));
