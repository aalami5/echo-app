const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
const api = require('../src/services/readOnlyPatients.ts');
function fixture(ids = ['a']) {
  return { patients: Object.fromEntries(ids.map(id => [id, { id, name: `Synthetic ${id}`, mrn: `TEST-${id}`, hospital: 'SEQ', callDayId: 'day', timeSeen: '2026-11-03T12:00:00Z' }])),
    callDays: { day: { id: 'day', date: '2026-11-03', patientIds: ids } }, callDayOrder: ['day'] };
}
const phone = data => JSON.stringify({ state: data, version: 0 });
const ready = (data, source) => ({ status: 'ready', snapshot: api.parseSnapshot(source === 'phone' ? phone(data) : JSON.stringify(data), source), checkedAt: '2026-11-03T12:00:00Z' });
const missing = { status: 'missing', message: 'Missing' };
test('phone edits, local-only patients and removal markers override server without mutation', () => {
  const local = fixture(['a', 'local']), server = fixture(['a', 'removed', 'server']);
  local.patients.a.name = 'Synthetic phone edit'; local.removedPatientIds = ['removed'];
  const before = JSON.stringify({ local, server });
  const view = { local: ready(local, 'phone'), server: ready(server, 'server') };
  const rows = api.displayedRows(view);
  assert.deepEqual(rows.map(p => p.id).sort(), ['a', 'local', 'server']);
  assert.equal(rows.find(p => p.id === 'a').name, 'Synthetic phone edit');
  assert.equal(rows.find(p => p.id === 'a').source, 'phone');
  assert.equal(JSON.stringify({ local, server }), before);
});
test('local-only, server-only and valid empty datasets remain distinct', () => {
  assert.equal(api.displayedRows({ local: ready(fixture(), 'phone'), server: missing }).length, 1);
  assert.equal(api.displayedRows({ local: missing, server: ready(fixture(), 'server') })[0].source, 'server');
  assert.deepEqual(api.displayedRows({ local: ready(fixture([]), 'phone'), server: missing }), []);
});
test('rejects malformed, orphaned and oversized metadata instead of truncating', () => {
  for (const raw of ['bad', 'null', '[]', '{}', JSON.stringify({ ...fixture(), patients: { a: { ...fixture().patients.a, id: 'wrong' } } }),
    JSON.stringify({ ...fixture(), callDays: {} }), JSON.stringify({ ...fixture(), removedPatientIds: [42] })]) {
    assert.throws(() => api.parseSnapshot(raw, 'server'), /validated/);
  }
  assert.throws(() => api.parseSnapshot(' '.repeat(api.PATIENT_METADATA_LIMIT + 1), 'server'), /limit/);
  assert.throws(() => api.parseSnapshot('😀'.repeat(api.PATIENT_METADATA_LIMIT / 3), 'server'), /limit/);
  assert.throws(() => api.parseSnapshot(JSON.stringify(fixture(Array.from({ length: api.PATIENT_RECORD_LIMIT + 1 }, (_, i) => String(i)))), 'server'), /limit/);
  const a = fixture(Array.from({ length: 3000 }, (_, i) => `a${i}`)), b = fixture(Array.from({ length: 3000 }, (_, i) => `b${i}`));
  assert.throws(() => api.displayedRows({ local: ready(a, 'phone'), server: ready(b, 'server') }), /limit/);
});
test('grouping/search handles call-day and hospital groups with filtered full rows', () => {
  const data = fixture(['a', 'b']); data.patients.b.hospital = 'ECH';
  const rows = ready(data, 'server').snapshot.rows;
  assert.equal(api.patientSections(rows, '').length, 2);
  assert.deepEqual(api.patientSections(rows, 'el camino')[0].data.map(p => p.id), ['b']);
  assert.equal(api.patientSections(rows, 'TEST-a')[0].data[0].id, 'a');
  assert.equal(api.patientSections(rows, 'no-match').length, 0);
});
test('source failures are honest, independent and do not expose raw native errors', async () => {
  let result = await api.readPatientView({ readLocal: async () => { throw Error('private content'); }, readServer: async () => JSON.stringify(fixture()) }, new AbortController().signal);
  assert.equal(result.local.status, 'error'); assert.equal(result.server.status, 'ready');
  assert.doesNotMatch(JSON.stringify(result.local), /private content/);
  result = await api.readPatientView({ readLocal: async () => phone(fixture()), readServer: async () => { throw new api.PatientReadError('Server access was not authorized.'); } }, new AbortController().signal);
  assert.equal(result.local.status, 'ready'); assert.match(result.server.message, /not authorized/);
  result = await api.readPatientView({ readLocal: async () => null, readServer: async () => '{}' }, new AbortController().signal);
  assert.equal(result.local.status, 'missing'); assert.equal(result.server.status, 'error');
});
test('overlapping refresh and unmount drop stale completions including uncancellable local reads', async () => {
  const locals = [], published = [], signals = [];
  const reader = api.createPatientReader({ readLocal: () => new Promise(resolve => locals.push(resolve)),
    readServer: async signal => { signals.push(signal); return JSON.stringify(fixture()); } }, view => published.push(view));
  const first = reader.refresh(); await Promise.resolve();
  const second = reader.refresh(); await Promise.resolve();
  assert.equal(signals[0].aborted, true);
  locals[1](phone(fixture(['new']))); await second;
  locals[0](phone(fixture(['old']))); await first;
  assert.equal(published.length, 1); assert.equal(published[0].local.snapshot.rows[0].id, 'new');
  const third = reader.refresh(); await Promise.resolve(); reader.cancel(); locals[2](phone(fixture())); await third;
  assert.equal(signals[2].aborted, true); assert.equal(published.length, 1);
});
class FakeXHR {
  headers = {}; status = 200; responseText = JSON.stringify(fixture()); readyState = 1;
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { this.headers[k] = v; }
  getResponseHeader() { return this.length || null; }
  send() { this.sent = true; }
  abort() { this.aborted = true; this.onabort?.(); }
}
test('network read is authenticated GET only with no-store and no missing-token request', async () => {
  const xhr = new FakeXHR(), signal = new AbortController().signal;
  const promise = api.requestPatientMetadata('https://test.invalid/', 'synthetic', signal, () => xhr);
  assert.equal(xhr.method, 'GET'); assert.equal(xhr.url, 'https://test.invalid/patients/list');
  assert.equal(xhr.headers.Authorization, 'Bearer synthetic'); assert.equal(xhr.headers['Cache-Control'], 'no-store');
  assert.equal(xhr.timeout, 15000); xhr.onload(); assert.equal(await promise, xhr.responseText);
  await assert.rejects(api.requestPatientMetadata('https://test.invalid', '', signal, () => assert.fail()), /Settings/);
  await assert.rejects(api.requestPatientMetadata('http://test.invalid', 'synthetic', signal, () => assert.fail()), /secure/);
});
test('network handles progress/header/actual size limits, HTTP, timeout, offline and cancellation', async () => {
  for (const trigger of [
    x => { x.length = String(api.PATIENT_METADATA_LIMIT + 1); x.readyState = 2; x.onreadystatechange(); },
    x => x.onprogress({ loaded: api.PATIENT_METADATA_LIMIT + 1 }),
    x => { x.responseText = 'x'.repeat(api.PATIENT_METADATA_LIMIT + 1); x.onload(); },
    x => { x.status = 403; x.onload(); }, x => { x.status = 500; x.onload(); },
    x => x.ontimeout(), x => x.onerror(),
  ]) {
    const xhr = new FakeXHR(); const result = api.requestPatientMetadata('https://test.invalid', 'synthetic', new AbortController().signal, () => xhr);
    trigger(xhr); await assert.rejects(result, api.PatientReadError); assert.equal(xhr.aborted, true);
  }
  const xhr = new FakeXHR(), controller = new AbortController();
  const result = api.requestPatientMetadata('https://test.invalid', 'synthetic', controller.signal, () => xhr);
  controller.abort(); await assert.rejects(result, /cancelled/); assert.equal(xhr.aborted, true);
});

test('slow phone reads time out independently and late resolution cannot update the returned view', async () => {
  let finish;
  const result = await api.readPatientView({ localTimeoutMs: 5, readLocal: () => new Promise(resolve => { finish = resolve; }), readServer: async () => JSON.stringify(fixture()) }, new AbortController().signal);
  assert.equal(result.server.status, 'ready'); assert.equal(result.local.status, 'error');
  assert.match(result.local.message, /timed out/);
  finish(phone(fixture())); await Promise.resolve(); assert.equal(result.local.status, 'error');
});
