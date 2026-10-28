const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('module');
const fs = require('fs');
const native = require('abort-controller/dist/abort-controller');
const original = { fetch: global.fetch, AbortController: global.AbortController, AbortSignal: global.AbortSignal, URL: global.URL, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
let settings = { gatewayUrl: 'https://echo.test', gatewayToken: 'test-token' };
let hydrated = false;
const load = Module._load;
Module._load = function(id, ...args) {
  if (id === '@react-native-async-storage/async-storage') return {};
  if (id.endsWith('/settingsStore')) return { useSettingsStore: {
    getState: () => settings,
    persist: { hasHydrated: () => hydrated, rehydrate: async () => { hydrated = true; } },
  } };
  return load.call(this, id, ...args);
};
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const { assistantApi } = require('../src/services/assistant.ts');
Module._load = load;
global.AbortController = native.AbortController;
global.AbortSignal = native.AbortSignal;
// Match the native URL's read-only port behavior, not Node's writable port.
global.URL = class {
  constructor(value) { this.value = value; }
  get port() { return new original.URL(this.value).port; }
  toString() { return this.value; }
};
after(() => Object.assign(global, original));

test('bootstrap and voice offers work with actual native AbortSignal lacking timeout', async () => {
  assert.equal(typeof global.AbortSignal.timeout, 'undefined');
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({url, options});
    assert.ok(options.signal instanceof native.AbortSignal);
    return {ok: true, json: async () => ({ready: true})};
  };
  assert.deepEqual(await assistantApi('/bootstrap'), {ready: true});
  assert.equal(hydrated, true);
  await assistantApi('/conversations/home/voice/session/offer', {sdp: 'test-offer'});
  assert.equal(calls[0].url, 'https://echo.test/patients/assistant/bootstrap');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.body, '{"sdp":"test-offer"}');
});

test('direct gateway port mapping works without a URL setter; path ports stay unchanged', async () => {
  for (const [base, expected] of [
    ['http://127.0.0.1:18789/', 'http://127.0.0.1:18790'],
    ['http://[::1]:18789', 'http://[::1]:18790'],
    ['https://echo.test/path:18789', 'https://echo.test/path:18789'],
  ]) {
    settings.gatewayUrl = base;
    global.fetch = async url => {
      assert.equal(url, `${expected}/patients/assistant/bootstrap`);
      return {ok: true, json: async () => ({})};
    };
    await assistantApi('/bootstrap');
  }
});

test('timeout aborts requests once, clears timer and reports useful error without retry', async () => {
  let timeout, clears = 0, calls = 0;
  global.setTimeout = (fn, ms) => { assert.equal(ms, 55000); timeout = fn; return 42; };
  global.clearTimeout = id => { assert.equal(id, 42); clears++; };
  global.fetch = async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      timeout();
    });
  };
  await assert.rejects(assistantApi('/bootstrap'), /took too long/);
  assert.equal(calls, 1);
  assert.equal(clears, 1);
  global.setTimeout = original.setTimeout;
  global.clearTimeout = original.clearTimeout;
});

test('auth failures and unreadable responses cannot masquerade as successful bootstrap', async () => {
  global.fetch = async () => ({ok: false, status: 401, json: async () => ({error: 'Please sign in again.'})});
  await assert.rejects(assistantApi('/bootstrap'), /sign in again/);
  global.fetch = async () => ({ok: true, json: async () => {throw new Error('invalid JSON');}});
  await assert.rejects(assistantApi('/bootstrap'), /unreadable response/);
});
