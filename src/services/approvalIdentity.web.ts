import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function createOrLoad(namespace: string) {
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle) throw new Error('Approvals require a secure browser connection.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('echo-operator-identity', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Secure browser key storage unavailable.'));
  });
  const key = bytesToHex(sha256(namespace));
  try {
    let pair = await new Promise<CryptoKeyPair | undefined>((resolve, reject) => {
      const r = db.transaction('keys', 'readonly').objectStore('keys').get(key);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Cannot read approval identity.'));
    });
    if (!pair) {
      pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite');
        const store = tx.objectStore('keys'), existing = store.get(key);
        existing.onsuccess = () => { if (existing.result) pair = existing.result; else store.put(pair, key); };
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error('Cannot retain approval identity.'));
      });
    }
    if (!pair) throw new Error('Approval identity unavailable.');
    const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const privateKey = pair.privateKey;
    return { id: bytesToHex(sha256(publicKey)), publicKey: encode(publicKey),
      sign: async (value: string) => encode(new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(value)))) };
  } finally { db.close(); }
}

// Serialize initialization within a process so simultaneous connects cannot rotate the identity.
const loading = new Map<string, ReturnType<typeof createOrLoad>>();
export function loadApprovalIdentity(namespace: string) {
  let promise = loading.get(namespace);
  if (!promise) {
    promise = createOrLoad(namespace);
    loading.set(namespace, promise);
    promise.catch(() => loading.delete(namespace));
  }
  return promise;
}
