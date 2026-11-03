const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), Module = require('node:module');
const protectedKeys = ['echo-patients','patient-dictations-store','operative-dictation-sync-outbox-v1','operative-email-receipts-v1','echo-assistant-outbox-v1'];
const values = new Map(protectedKeys.map(k => [k, 'retained-original-'+k]));
const touched = []; let failKey = null;
const storage = { getItem: async key => { touched.push(['read',key]); assert.ok(!protectedKeys.includes(key)); return values.get(key) ?? null; },
  setItem: async (key,value) => { touched.push(['write',key]); assert.ok(!protectedKeys.includes(key)); if(key === failKey) throw Error('disk full'); values.set(key,value); } };
const original = Module._load;
Module._load = function(id,...args) {
  if(id === '@react-native-async-storage/async-storage') return {__esModule:true,default:storage};
  if(id === 'expo-crypto') return {randomUUID:require('node:crypto').randomUUID};
  if(/\/(patientsStore|patientDictationsStore|patientSync|dictationSync|clinicalRestore|emailReceipts)$/.test(id)) assert.fail('new-case store must not import '+id);
  return original.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const service = require('../src/services/newPatientCases.ts');
const {useNewPatientCasesStore:store} = require('../src/stores/newPatientCasesStore.ts');
const input = {name:'Synthetic New Patient',mrn:'TEST-ONLY',hospital:'SEQ',dob:'',room:'',chiefComplaint:''};
const clone = value => JSON.parse(JSON.stringify(value));
let id;
test('new patient, current-case header, text, photos, draft and manual edits survive selective reopen without legacy reads/writes',async()=>{
  const before = protectedKeys.map(k=>[k,values.get(k)]);
  id = await store.getState().start(input,'2026-10-31'); await store.getState().flush();
  let d=store.getState().dictations[id]; assert.match(d.transcriptParts[0].content,/Dr\. Oliver Aalami/); assert.match(d.transcriptParts[0].content,/October 31, 2026/);
  assert.equal(d.selectedProcedures.length,0);
  store.getState().updateDictation(id,{transcriptParts:[...d.transcriptParts,{id:'note',type:'voice',content:'Synthetic left arm procedure. No complications documented.',timestamp:new Date().toISOString()},
    {id:'image',type:'image',content:'Synthetic image',imageBase64:'dGVzdA==',imageMimeType:'image/png',ocrText:'Synthetic OCR',timestamp:new Date().toISOString()}],generatedReport:'Synthetic draft; manually revised.',selectedProcedures:['Custom combined procedure']});
  await store.getState().flush(); const expected=clone(store.getState().dictations[id]);
  store.setState({patients:{},dictations:{}}); touched.length=0;
  await store.getState().open(id);
  assert.deepEqual(store.getState().dictations[id],expected);
  assert.deepEqual(touched,[['read',service.CASE_PREFIX+id]]);
  assert.deepEqual(protectedKeys.map(k=>[k,values.get(k)]),before);
  await store.getState().refresh(); assert.equal(store.getState().summaries[0].id,id);
});
test('failed save is explicit, blocks replacing unsaved case, preserves original bytes and retry uses same ID',async()=>{
  const key=service.CASE_PREFIX+id, before=values.get(key); failKey=key;
  store.getState().updateDictation(id,{generatedReport:'Unsaved synthetic manual edit'});
  await assert.rejects(store.getState().flush(),/disk full/); assert.match(store.getState().saveError,/Not saved/); assert.equal(values.get(key),before);
  await assert.rejects(store.getState().start(input,'2026-11-01'),/disk full/);
  assert.equal(store.getState().dictations[id].generatedReport,'Unsaved synthetic manual edit');
  failKey=null; await store.getState().retrySave();
  assert.equal(store.getState().saveError,null); assert.equal(JSON.parse(values.get(key)).dictation.id,id);
  assert.equal(JSON.parse(values.get(key)).dictation.generatedReport,'Unsaved synthetic manual edit');
});
test('queued saves retain latest edit, report identity cannot be reassigned, and final status persists',async()=>{
  store.getState().updateDictation(id,{generatedReport:'first'});
  store.getState().updateDictation(id,{generatedReport:'latest',id:'tampered',patientId:'other'});
  await store.getState().flush();
  let d=JSON.parse(values.get(service.CASE_PREFIX+id)).dictation;
  assert.equal(d.generatedReport,'latest'); assert.equal(d.id,id); assert.notEqual(d.patientId,'other');
  store.getState().finalizeDictation(id); await store.getState().flush();
  d=JSON.parse(values.get(service.CASE_PREFIX+id)).dictation; assert.equal(d.status,'final');
});
test('initial index reservation precedes case write; interrupted first save remains discoverable and never overwrites another case',async()=>{
  const map=new Map(); const calls=[];let fail=true;
  const repo=service.createCaseRepository({getItem:async k=>map.get(k)??null,setItem:async(k,v)=>{calls.push(k);if(k.startsWith(service.CASE_PREFIX)&&fail)throw Error('interrupted');map.set(k,v);}});
  const value={version:1,patient:Object.values(store.getState().patients)[0],dictation:clone(store.getState().dictations[id])};
  await assert.rejects(repo.save(value),/interrupted/); assert.equal(calls[0],service.CASE_INDEX_KEY);
  assert.equal((await repo.list())[0].id,id); await assert.rejects(repo.load(id),/safely/);
  fail=false;await repo.save(value);assert.deepEqual(await repo.load(id),value);assert.equal((await repo.list()).length,1);
});
test('corrupt index, mismatched identity, invalid dates and oversized payloads fail without truncation or storage replacement',async()=>{
  assert.equal(service.validOperationDate('2026-02-31'),false);assert.equal(service.validOperationDate('2026-11-03'),true);
  const value={version:1,patient:Object.values(store.getState().patients)[0],dictation:clone(store.getState().dictations[id])};
  const map=new Map([[service.CASE_INDEX_KEY,'broken']]);let writes=0;
  const repo=service.createCaseRepository({getItem:async k=>map.get(k)??null,setItem:async(k,v)=>{writes++;map.set(k,v);}});
  await assert.rejects(repo.save(value));assert.equal(writes,0);
  const wrong=clone(value);wrong.dictation.patientId='wrong';assert.throws(()=>repo.save(wrong),/safely/);
  const huge=clone(value);huge.dictation.transcriptParts.push({id:'big',type:'image',content:'image',timestamp:'2026-11-03',imageBase64:'x'.repeat(service.CASE_BYTES)});
  assert.throws(()=>repo.save(huge),/too large/);assert.equal(writes,0);
  map.set(service.CASE_PREFIX+id,JSON.stringify({...value,dictation:{...value.dictation,id:'newcase-mismatched00000'}}));
  await assert.rejects(repo.load(id),/safely/);
});
test('list loads only bounded metadata; opening one case does not read another case',async()=>{
  const second=await store.getState().start({...input,name:'Second Synthetic'},'2026-11-02');await store.getState().flush();
  touched.length=0;await store.getState().refresh();assert.deepEqual(touched,[['read',service.CASE_INDEX_KEY]]);
  assert.equal(store.getState().summaries.length,2);touched.length=0;
  await store.getState().open(id);assert.deepEqual(touched,[['read',service.CASE_PREFIX+id]]);
  assert.deepEqual(Object.keys(store.getState().dictations),[id]);assert.notEqual(id,second);
});
