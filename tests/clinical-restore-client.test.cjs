const {test}=require('node:test');const assert=require('node:assert/strict');
const ts=require('typescript');const Module=require('node:module');const fs=require('node:fs');
const values=new Map();const storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>{values.set(k,v);},removeItem:async k=>{values.delete(k);}};
const original=Module._load;
Module._load=function(id,...args){
 if(id==='expo-secure-store')return {getItemAsync:storage.getItem,setItemAsync:storage.setItem,deleteItemAsync:storage.removeItem};
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage};
 if(id.endsWith('/settingsStore'))return {useSettingsStore:{getState:()=>({gatewayUrl:'https://test.invalid',gatewayToken:'synthetic'})}};
 if(id.endsWith('/patientSync'))return {syncPatients:async()=>({success:true})};
 if(id.endsWith('/dictationSync'))return {syncFinalizedDictations:async()=>({success:true})};
 return original.call(this,id,...args);
};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {usePatientsStore:patients}=require('../src/stores/patientsStore.ts');
const {usePatientDictationsStore:reports}=require('../src/stores/patientDictationsStore.ts');
const {restoreClinicalData,useClinicalRestoreStatus}=require('../src/services/clinicalRestore.ts');
const remote={patients:{remote:{id:'remote',name:'Synthetic Remote',mrn:'TEST',callDayId:'day',hospital:'OTHER',dob:'',room:'',chiefComplaint:'',timeSeen:'2026-09-19T12:00:00Z'}},callDays:{day:{id:'day',date:'2026-09-19',displayDate:'Sep 19, 2026',dayOfWeek:'Saturday',patientIds:['remote']}},callDayOrder:['day']};
const remoteReports={dictations:{report:{id:'report',patientId:'remote',status:'draft',transcriptParts:[],generatedReport:'Synthetic draft',createdAt:'2026-09-19',updatedAt:'2026-09-19',selectedProcedures:[],dateOfOperation:'2026-09-19'}}};

test('fresh install restores patients and draft/final history, persists locally, no upload needed',async()=>{
 await patients.persist.rehydrate();await reports.persist.rehydrate();
 const calls=[];global.fetch=async(url,options)=>{calls.push(options.method||'GET');return {ok:true,json:async()=>url.includes('dictations')?remoteReports:remote};};
 await restoreClinicalData();assert.equal(patients.getState().patients.remote.name,'Synthetic Remote');assert.equal(reports.getState().dictations.report.status,'draft');
 await new Promise(r=>setImmediate(r));
 assert.match(values.get('echo-patients'),/Synthetic Remote/);assert.match(values.get('patient-dictations-store'),/Synthetic draft/);assert.deepEqual(calls,['GET','GET']);
});
test('existing local changes and newly added cases survive a repeated restore',async()=>{
 patients.getState().updatePatient('remote',{name:'Synthetic Local Edit'});
 const id=patients.getState().addPatient({name:'Synthetic New',mrn:'TESTNEW',dob:'',room:'',hospital:'OTHER',chiefComplaint:''},'stale-day-from-old-device');
 assert.ok(patients.getState().callDays[patients.getState().patients[id].callDayId]);
 reports.getState().updateDictation('report',{generatedReport:'Unsynced local revision'});
 await restoreClinicalData();assert.equal(patients.getState().patients.remote.name,'Synthetic Local Edit');assert.ok(patients.getState().patients[id]);assert.equal(reports.getState().dictations.report.generatedReport,'Unsynced local revision');
});
test('connection failures and malformed responses never mutate local cases',async()=>{
 const before=JSON.stringify(patients.getState().patients);
 global.fetch=async()=>({ok:false,status:401});await assert.rejects(restoreClinicalData(),/connection/);
 assert.equal(JSON.stringify(patients.getState().patients),before);assert.ok(useClinicalRestoreStatus.getState().error);
 global.fetch=async()=>({ok:true,json:async()=>({patients:{},callDays:{},callDayOrder:[]})});await assert.rejects(restoreClinicalData(),/invalid backup/);
 assert.equal(JSON.stringify(patients.getState().patients),before);
});
test('removed records stay hidden on the same device after restore, server history retained',async()=>{
 patients.getState().deletePatient('remote');reports.getState().deleteDictation('report');
 global.fetch=async url=>({ok:true,json:async()=>url.includes('dictations')?remoteReports:remote});
 await restoreClinicalData();assert.equal(patients.getState().patients.remote,undefined);assert.equal(reports.getState().dictations.report,undefined);
});

test('full old-phone record enriches a recovered placeholder, but never overwrites a manual edit',()=>{
 const complete=remote.patients.remote;
 patients.setState({patients:{remote:{...complete,name:'Recovered Header',recoveredFromReport:true}},removedPatientIds:[]});
 patients.getState().restoreMissing(remote);
 assert.equal(patients.getState().patients.remote.name,'Synthetic Remote');
 patients.setState({patients:{remote:{...complete,name:'Locally corrected name',recoveredFromReport:true,updatedAt:'2026-09-20T00:00:00Z'}}});
 patients.getState().restoreMissing(remote);
 assert.equal(patients.getState().patients.remote.name,'Locally corrected name');
});
