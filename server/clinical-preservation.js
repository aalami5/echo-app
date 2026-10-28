// Legacy clients upload whole snapshots. Missing records are NEVER deletions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function encryptionKey(file) {
  const keyFile = process.env.CLINICAL_KEY_FILE || path.join(path.dirname(file), '.clinical-storage-key');
  if (!fs.existsSync(keyFile)) {
    fs.writeFileSync(keyFile, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
  }
  const key = fs.readFileSync(keyFile);
  if (key.length !== 32) throw new Error('Invalid clinical encryption key');
  return key;
}

function seal(file, data) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(file), nonce);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return JSON.stringify({ format: 'echo-clinical-aes256gcm-v1', nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: body.toString('base64') });
}

function unseal(file, raw) {
  const data = JSON.parse(raw);
  if (data.format !== 'echo-clinical-aes256gcm-v1') return data;
  // A missing key must never be silently regenerated for existing encrypted data.
  const keyFile = process.env.CLINICAL_KEY_FILE || path.join(path.dirname(file), '.clinical-storage-key');
  if (!fs.existsSync(keyFile)) throw new Error('Clinical recovery key unavailable');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(file), Buffer.from(data.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}

function recordMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid clinical record map');
  return value;
}

function mergePatients(current, incoming) {
  recordMap(incoming.patients); recordMap(incoming.callDays);
  if (!Array.isArray(incoming.callDayOrder)) throw new Error('Invalid call day order');
  const patients = { ...current.patients };
  for (const [id, value] of Object.entries(incoming.patients)) {
    const old = patients[id];
    // A reconstructed header must never replace a full record from the old phone.
    if (old && !old.recoveredFromReport && value?.recoveredFromReport) continue;
    if (old?.updatedAt && (!value?.updatedAt || old.updatedAt > value.updatedAt)) continue;
    patients[id] = value;
  }
  const callDays = { ...current.callDays };
  for (const [id, day] of Object.entries(incoming.callDays)) {
    if (!day || !Array.isArray(day.patientIds)) throw new Error('Invalid call day');
    callDays[id] = { ...callDays[id], ...day, patientIds: [...new Set([...(callDays[id]?.patientIds || []), ...day.patientIds])] };
  }
  for (const [id, patient] of Object.entries(patients)) {
    if (!patient || typeof patient !== 'object' || patient.id !== id || !callDays[patient.callDayId]) throw new Error('Patient has no valid call day');
  }
  // Rebuild references from records, not from a possibly stale phone index.
  for (const [id, day] of Object.entries(callDays)) {
    callDays[id] = { ...day, patientIds: Object.values(patients).filter(p => p.callDayId === id).map(p => p.id) };
  }
  return { patients, callDays, callDayOrder: Object.keys(callDays).sort((a,b) => callDays[b].date.localeCompare(callDays[a].date)) };
}

function mergeDictations(current, incoming) {
  recordMap(incoming);
  const dictations = { ...current.dictations };
  for (const [id, report] of Object.entries(incoming)) {
    if (!report || report.id !== id) throw new Error('Invalid report');
    const old = dictations[id];
    if (!old || (report.updatedAt || '') >= (old.updatedAt || '')) dictations[id] = report;
  }
  return { dictations };
}

function readClinical(file) {
  // Never turn an unreadable database into an empty successful response.
  return unseal(file, fs.readFileSync(file, 'utf8'));
}

function preserveAndWrite(file, data) {
  const dir = path.join(path.dirname(file), 'clinical-history');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (fs.existsSync(file)) {
    const before = fs.readFileSync(file);
    const decoded = unseal(file, before);
    if (JSON.parse(before).format === 'echo-clinical-aes256gcm-v1' &&
        JSON.stringify({ ...decoded, lastSync: null }) === JSON.stringify({ ...data, lastSync: null })) return decoded;
    const hash = crypto.createHash('sha256').update(before).digest('hex');
    const backup = path.join(dir, `${path.basename(file)}.${hash}`);
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, seal(file, unseal(file, before)), { mode: 0o600, flag: 'wx' });
  }
  const next = { ...data, lastSync: new Date().toISOString() };
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeFileSync(fd, seal(file, next)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  return next;
}

module.exports = { mergePatients, mergeDictations, readClinical, preserveAndWrite, seal, unseal };
