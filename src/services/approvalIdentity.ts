import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
export function base64url(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '', bits = 0, value = 0;
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 6) { bits -= 6; out += chars[(value >>> bits) & 63]; } }
  if (bits) out += chars[(value << (6 - bits)) & 63];
  return out;
}
async function createOrLoad(namespace: string) {
  const key = `echo.operator.${bytesToHex(sha256(namespace))}`;
  let encoded = await SecureStore.getItemAsync(key);
  if (!encoded) {
    encoded = bytesToHex(await Crypto.getRandomBytesAsync(32));
    await SecureStore.setItemAsync(key, encoded, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  const secret = hexToBytes(encoded), publicKey = ed25519.getPublicKey(secret);
  return { id: bytesToHex(sha256(publicKey)), publicKey: base64url(publicKey),
    sign: async (value: string) => base64url(ed25519.sign(new TextEncoder().encode(value), secret)) };
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
