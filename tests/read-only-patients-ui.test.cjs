const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), Module = require('node:module');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const record = { id: 'synthetic', name: 'Synthetic patient', mrn: 'TEST-ONLY', hospital: 'SEQ', callDayId: 'day' };
const dataset = { patients: { synthetic: record }, callDays: { day: { id: 'day', date: '2026-11-03', patientIds: ['synthetic'] } }, callDayOrder: ['day'] };
const bytes = JSON.stringify({ state: { ...dataset, removedPatientIds: [] }, version: 0 });
const reads = [], requests = [], listeners = [];
let localFailure = false, serverFailure = false;
const original = Module._load;
Module._load = function(id, ...args) {
  if (/\/(LegacyPatientsScreen|patientsStore|patientDictationsStore|clinicalRestore|patientSync|dictationSync|emailReceiptsStore|chatStore)$/.test(id)) assert.fail(`safe-start imported ${id}`);
  if (id === 'expo-secure-store') return {
    getItemAsync: async key => { reads.push(key); assert.equal(key, 'echo-patients'); if(localFailure) throw Error('synthetic private'); return bytes; },
    setItemAsync: () => assert.fail('must not write'), deleteItemAsync: () => assert.fail('must not delete'),
  };
  if (id === '@react-native-async-storage/async-storage') assert.fail('must not load dictation/archive storage');
  if (id.endsWith('/settingsStore')) return { useSettingsStore: selector => selector({ gatewayUrl: 'https://test.invalid', gatewayToken: 'synthetic' }) };
  if (id === '@react-navigation/native') return { useIsFocused: () => true };
  if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
  if (id === 'react-native') return {
    ActivityIndicator: 'ActivityIndicator', View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: x => x },
    AppState: { currentState: 'active', addEventListener: (_, callback) => { listeners.push(callback); return { remove() { listeners.splice(listeners.indexOf(callback), 1); } }; } },
    SectionList: props => React.createElement('SectionList', { ...props, ListEmptyComponent: undefined }, props.sections.length ? props.sections.map(section => React.createElement('Section', { key: section.title }, props.renderSectionHeader({ section }), ...section.data.map(item => React.createElement('Row', { key: item.id }, props.renderItem({ item }))))) : props.ListEmptyComponent),
  };
  return original.call(this, id, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, f);
global.XMLHttpRequest = class {
  status = 200; readyState = 1; responseText = JSON.stringify(dataset);
  open(method, url) { requests.push([method, url]); }
  setRequestHeader() {}
  send() { queueMicrotask(() => { if (serverFailure) this.onerror(); else this.onload(); }); }
  abort() { this.onabort?.(); }
};
const Screen = require('../app/(tabs)/patients.tsx').default;
test('safe-start route displays searchable virtualized read-only rows; refresh/background never write or hydrate legacy stores', async () => {
  let tree; await act(async () => { tree = create(React.createElement(Screen)); });
  let rendered = JSON.stringify(tree.toJSON());
  assert.match(rendered, /Synthetic patient/); assert.match(rendered, /Read-only view/); assert.match(rendered, /Phone edits and removal markers/);
  assert.equal(tree.root.findAllByType('TouchableOpacity').length, 1);
  assert.equal(tree.root.findByType('SectionList').props.initialNumToRender, 12);
  const input = tree.root.findByType('TextInput');
  await act(async () => input.props.onChangeText('not-here'));
  assert.match(JSON.stringify(tree.toJSON()), /No matches/);
  await act(async () => input.props.onChangeText('TEST-ONLY'));
  assert.match(JSON.stringify(tree.toJSON()), /Synthetic patient/);
  await act(async () => tree.root.findByType('TouchableOpacity').props.onPress());
  assert.equal(reads.length, 2);
  await act(async () => listeners[0]('background'));
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Synthetic patient/);
  await act(async () => listeners[0]('active'));
  assert.match(JSON.stringify(tree.toJSON()), /Synthetic patient/);
  assert.ok(requests.every(([method, url]) => method === 'GET' && url === 'https://test.invalid/patients/list'));
  await act(async () => tree.unmount()); assert.equal(listeners.length, 0);
});
test('server-only fallback labels unverified phone edits; dual failure never masquerades as empty success', async () => {
  localFailure = true; let tree;
  await act(async () => { tree = create(React.createElement(Screen)); });
  assert.match(JSON.stringify(tree.toJSON()), /Server copy only/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /synthetic private/);
  await act(async () => tree.unmount());
  serverFailure = true;
  await act(async () => { tree = create(React.createElement(Screen)); });
  assert.match(JSON.stringify(tree.toJSON()), /could not be loaded/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /0 patients available/);
  await act(async () => tree.unmount());
});
