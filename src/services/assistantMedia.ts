import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { assistantApi, newSubmissionId } from './assistant';

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
export type AssistantAttachment = { id: string; fileName: string; uri: string; mimeType: string; size: number; image: boolean };
export async function prepareAttachment(asset: { uri: string; name?: string | null; mimeType?: string | null; size?: number; width?: number; height?: number }, image = false): Promise<AssistantAttachment> {
  const id = newSubmissionId();
  let uri = asset.uri, mimeType = asset.mimeType || 'application/octet-stream', fileName = asset.name || 'Attachment';
  if (image) {
    // Normalize HEIC/rotations into provider-readable JPEG. Bound both portrait and landscape.
    const max = Math.max(asset.width || 0, asset.height || 0);
    const actions = max > 2200 ? [{ resize: (asset.width || 0) >= (asset.height || 0) ? { width: 2200 } : { height: 2200 } }] : [];
    const result = await ImageManipulator.manipulateAsync(uri, actions, { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
    uri = result.uri; mimeType = 'image/jpeg'; fileName = `${(fileName === 'Attachment' ? 'Photo' : fileName).replace(/\.[^.]+$/, '')}.jpg`;
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('That attachment is no longer available. Please select it again.');
  const size = info.size;
  if (!size || size > MAX_ATTACHMENT_BYTES) throw new Error(`${fileName} must be between 1 byte and 6 MB. Choose a smaller file.`);
  // Keep a private local copy across picker dismissal and tab navigation. No upload until Send.
  const directory = `${FileSystem.documentDirectory}assistant-drafts/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const copy = `${directory}${id}${image ? '.jpg' : ''}`;
  await FileSystem.copyAsync({ from: uri, to: copy });
  if (image && uri !== asset.uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  return { id, uri: copy, fileName, mimeType, size, image };
}
export async function uploadAttachments(conversationId: string, files: AssistantAttachment[], progress: (done: number, total: number) => void) {
  if (files.length > MAX_ATTACHMENTS) throw new Error('Attach up to five files per message.');
  const ids: string[] = [];
  progress(0, files.length);
  for (const file of files) {
    const info = await FileSystem.getInfoAsync(file.uri);
    if (!info.exists || !info.size || info.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.fileName} is unavailable or exceeds 6 MB. Remove it and select it again.`);
    const content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
    const result = await assistantApi('/uploads', { conversationId, idempotencyKey: file.id, content, name: file.fileName, mimeType: file.mimeType });
    if (!result?.id) throw new Error('Upload was not confirmed. Your selection is saved; try again.');
    ids.push(result.id); progress(ids.length, files.length);
  }
  return ids;
}
export async function removeLocalAttachments(files: AssistantAttachment[]) {
  for (const file of files) {
    if (file.uri.startsWith(`${FileSystem.documentDirectory}assistant-drafts/`)) await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
  }
}
