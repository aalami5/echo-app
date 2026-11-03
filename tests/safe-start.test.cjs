const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),ts=require('typescript'),Module=require('module');
const values=new Map([['echo-patients','retained patient metadata'],['patient-dictations-store','retained large original'],['echo-chat','retained legacy history'],['operative-dictation-sync-outbox-v1','retained queued backup'],['echo-assistant-outbox-v1','uncertain receipt']]);
const touched=[];const storage={getItem:async k=>{touched.push(['read',k]);return values.get(k)||null},setItem:async(k,v)=>{touched.push(['write',k]);values.set(k,v)},removeItem:async k=>{touched.push(['delete',k]);values.delete(k)}};
const original=Module._load;
Module._load=function(id,...args){
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage};
 if(id==='expo-secure-store')return {getItemAsync:storage.getItem,setItemAsync:storage.setItem,deleteItemAsync:storage.removeItem};
 if(id.endsWith('/settingsStore'))return {useSettingsStore:{getState:()=>({gatewayUrl:'https://test.invalid',gatewayToken:'synthetic'})}};
 if(id.endsWith('/patientSync'))return {syncPatients:async()=>assert.fail('must not sync')};
 return original.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {usePatientDictationsStore:reports}=require('../src/stores/patientDictationsStore.ts');
const {usePatientsStore:patients}=require('../src/stores/patientsStore.ts');
const {useChatStore:chat}=require('../src/stores/chatStore.ts');
const restore=require('../src/services/clinicalRestore.ts');const sync=require('../src/services/dictationSync.ts');const receipts=require('../src/services/emailReceipts.ts');
const patientSync=require('../src/services/patientSync.ts');

test('module startup and explicit rehydrate never load or alter protected original stores',async()=>{
 const before=[...values];await new Promise(r=>setImmediate(r));
 assert.equal(reports.persist.hasHydrated(),false);assert.equal(chat.persist.hasHydrated(),false);
 assert.equal(patients.persist.hasHydrated(),false);
 await reports.persist.rehydrate();await chat.persist.rehydrate();await patients.persist.rehydrate();
 assert.equal(patients.persist.hasHydrated(),false);
 assert.equal(reports.persist.hasHydrated(),false);assert.equal(chat.persist.hasHydrated(),false);
 assert.deepEqual(touched.filter(x=>values.has(x[1])),[]);assert.deepEqual([...values],before);
});
test('legacy patient actions cannot alter retained metadata, local state or sync while paused',()=>{
 const before=[...values], state=patients.getState();
 for(const run of [()=>state.restoreMissing({patients:{},callDays:{},callDayOrder:[]}),()=>state.addPatient({}),
  ()=>state.updatePatient('synthetic',{}),()=>state.deletePatient('synthetic'),()=>state.createCallDay(),
  ()=>state.deleteCallDay('synthetic'),()=>state.fixCallDayLabels(),()=>state.mergeDuplicateDates(),
  ()=>state.reorganizePatientsByTimeSeen(),()=>state.setSearchQuery('synthetic'),()=>state.exportToCSV()]) assert.throws(run,/preserved/);
 assert.deepEqual(patients.getState().patients,{});assert.deepEqual([...values],before);
});
test('all report editing operations fail before touching retained data or syncing',()=>{
 const before=[...values];
 assert.throws(()=>reports.getState().createDictation('synthetic'),/preserved/);
 assert.throws(()=>reports.getState().restoreMissing({}),/preserved/);
 assert.throws(()=>reports.getState().deleteDictation('synthetic'),/preserved/);
 assert.deepEqual([...values],before);assert.deepEqual(reports.getState().dictations,{});
});
test('restore, backup, receipts and sync retry cannot rehydrate, replay or write while paused',async()=>{
 global.fetch=()=>assert.fail('must not fetch');const before=[...values];
 await assert.rejects(restore.restoreClinicalData(),/preserved/);await assert.rejects(restore.backupClinicalData(),/preserved/);
 assert.equal((await sync.retryPendingDictationSync()).success,false);
 assert.equal((await sync.syncFinalizedDictations({})).success,false);
 assert.equal((await patientSync.syncPatients({patients:{synthetic:{id:'synthetic'}},callDays:{},callDayOrder:[]})).success,false);
 assert.equal(patientSync.hasPendingSync(),false);
 await patientSync.retryPendingSync();
 await receipts.refreshEmailReceipts();
 chat.getState().addMessage({id:'new-notification',role:'assistant',content:'synthetic'});
 await new Promise(r=>setImmediate(r));assert.deepEqual([...values],before);assert.deepEqual(touched.filter(x=>values.has(x[1])),[]);
});
