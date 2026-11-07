/** Lossless, content-addressed sidecars for new-case photos. No legacy archive access. */
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { CASE_BYTES, checkCase, createCaseRepository, type NewCase } from './newPatientCases';

const REFERENCE = 'echo-case-image-v1:';
// Bound one selectively opened case, not the complete archive. Metadata retains
// its separate 8 MiB budget; each attachment retains its own 8 MiB budget.
export const CASE_IMAGE_BYTES = 64 * 1024 * 1024;
export class CaseAttachmentError extends Error {
  constructor(public stage: 'ATTACHMENT_LIMIT' | 'ATTACHMENT_READ' | 'ATTACHMENT_VERIFY') {
    super(stage);
  }
}
const digest = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
export function createCaseAttachmentStorage(fs: typeof FileSystem = FileSystem) {
  function path(hash: string) {
    if (!fs.documentDirectory || !/^[a-f0-9]{64}$/.test(hash)) throw new CaseAttachmentError('ATTACHMENT_READ');
    return `${fs.documentDirectory}echo-new-case-images-v1/${hash}.b64`;
  }
  return {
    async read(hash: string, length: number): Promise<string> {
      const uri = path(hash), info = await fs.getInfoAsync(uri);
      if (!Number.isSafeInteger(length) || length < 1 || length > CASE_BYTES ||
          !info.exists || info.isDirectory || info.size !== length) throw new CaseAttachmentError('ATTACHMENT_READ');
      const value = await fs.readAsStringAsync(uri, { encoding: fs.EncodingType.UTF8 });
      if (value.length !== length || await digest(value) !== hash) throw new CaseAttachmentError('ATTACHMENT_VERIFY');
      return value;
    },
    async write(value: string): Promise<string> {
      // Base64 is ASCII. Reject unexpected text rather than creating a file whose
      // byte count cannot match the bounded reference on reopen.
      if (!value.length || value.length > CASE_BYTES || !/^[A-Za-z0-9+/=\r\n]+$/.test(value)) throw new CaseAttachmentError('ATTACHMENT_LIMIT');
      const hash = await digest(value), uri = path(hash);
      const info = await fs.getInfoAsync(uri);
      if (info.exists) {
        try {
          if (await this.read(hash, value.length) === value) return `${REFERENCE}${hash}:${value.length}`;
        } catch (error) {
          // Retry can restore a partial/corrupt sidecar from the still-open,
          // hash-matching source. Never trust the existence of a file alone.
          if (!(error instanceof CaseAttachmentError)) throw error;
        }
      }
      await fs.makeDirectoryAsync(`${fs.documentDirectory}echo-new-case-images-v1/`, { intermediates: true });
      // Native iOS implementation writes atomically. Verify before committing
      // a manifest; failed writes never replace the previous report manifest.
      await fs.writeAsStringAsync(uri, value, { encoding: fs.EncodingType.UTF8 });
      if (await this.read(hash, value.length) !== value) throw new CaseAttachmentError('ATTACHMENT_VERIFY');
      return `${REFERENCE}${hash}:${value.length}`;
    },
  };
}

type Repository = ReturnType<typeof createCaseRepository>;
export function createAttachmentCaseRepository(metadata: Repository, attachments = createCaseAttachmentStorage()): Repository {
  return {
    list: metadata.list,
    async load(id) {
      const value = await metadata.load(id);
      let total = 0;
      // Validate the whole reference budget before reading any attachment bytes.
      const refs = value.dictation.transcriptParts.map(part => {
        const image = part.imageBase64;
        if (!image?.startsWith(REFERENCE)) { total += image?.length || 0; return null; }
        const match = /^echo-case-image-v1:([a-f0-9]{64}):([1-9][0-9]{0,7})$/.exec(image);
        if (!match || Number(match[2]) > CASE_BYTES) throw new CaseAttachmentError('ATTACHMENT_READ');
        total += Number(match[2]);
        return { hash: match[1], length: Number(match[2]) };
      });
      if (total > CASE_IMAGE_BYTES) throw new CaseAttachmentError('ATTACHMENT_LIMIT');
      for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        if (ref) value.dictation.transcriptParts[i].imageBase64 = await attachments.read(ref.hash, ref.length);
      }
      checkCase(value);
      return value;
    },
    async save(value: NewCase) {
      checkCase(value);
      const images = value.dictation.transcriptParts.map(p => p.imageBase64);
      if (images.reduce((n, image) => n + (image?.length || 0), 0) > CASE_IMAGE_BYTES ||
          images.some(image => image?.startsWith(REFERENCE))) throw new CaseAttachmentError('ATTACHMENT_LIMIT');
      const snapshot: NewCase = JSON.parse(JSON.stringify(value));
      for (const part of snapshot.dictation.transcriptParts) {
        if (part.imageBase64) part.imageBase64 = await attachments.write(part.imageBase64);
      }
      // Existing v1 inline records remain readable. Only this saved case adopts
      // sidecars; no originals, prior attachments, or other cases are deleted.
      await metadata.save(snapshot);
    },
  };
}
