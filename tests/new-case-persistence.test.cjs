const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,os=require('node:os'),path=require('node:path'),ts=require('typescript'),Module=require('node:module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'echo-case-save-')),originalBytes=new Map(),reads=[],writes=[];
let primaryBroken=false,diskFull=false,corruptWrites=false;
const primary={getItem:async key=>{assert.match(key,/^echo-new-patient-case/);reads.push(key);if(primaryBroken)throw Error('primary index unavailable');return originalBytes.get(key)??null;},setItem:async()=>assert.fail('original storage must stay read-only')};
const files={documentDirectory:root+'/',EncodingType:{UTF8:'utf8'},getInfoAsync:async file=>{try{const s=await fsp.stat(file);return {exists:true,size:s.size,isDirectory:s.isDirectory()};}catch(e){if(e.code==='ENOENT')return {exists:false};throw e;}},readAsStringAsync:async file=>fsp.readFile(file,'utf8'),makeDirectoryAsync:async dir=>fsp.mkdir(dir,{recursive:true}),writeAsStringAsync:async(file,value)=>{if(diskFull)throw Error('ENOSPC: disk full');writes.push(file);await fsp.writeFile(file+'.tmp',corruptWrites?'invalid':value);await fsp.rename(file+'.tmp',file);}};
const original=Module._load;Module._load=function(id,...args){
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:primary};
 if(id==='expo-file-system/legacy')return files;
 if(id==='expo-crypto')return {randomUUID:require('node:crypto').randomUUID};
 if(/\/(patientsStore|patientDictationsStore|patientSync|dictationSync|clinicalRestore)$/.test(id))assert.fail('must not load legacy store');
 return original.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {caseRepository,createCaseFileStorage}=require('../src/services/newCasePersistence.ts');
const {CASE_PREFIX,CASE_INDEX_KEY,localOperationDate}=require('../src/services/newPatientCases.ts');
const {useNewPatientCasesStore:store}=require('../src/stores/newPatientCasesStore.ts');
const savedFile=id=>path.join(root,'echo-new-case-recovery-v1',CASE_PREFIX+id+'.json');
const input={name:'Synthetic Persistence Patient',mrn:'SYNTHETIC',dob:'',room:'',chiefComplaint:'',hospital:'SEQ'};
let id;
test('real filesystem save is verified and selectively reopened while original shared storage remains read-only',async()=>{
 id=await store.getState().start(input,'');await store.getState().flush();
 const d=store.getState().dictations[id];assert.equal(d.dateOfOperation,localOperationDate(d.createdAt));
 store.getState().updateDictation(id,{generatedReport:'Synthetic manual draft'});await store.getState().flush();
 assert.equal(store.getState().saving,false);assert.equal(store.getState().saveError,null);
 const saved=JSON.parse(fs.readFileSync(savedFile(id),'utf8'));assert.equal(saved.dictation.generatedReport,'Synthetic manual draft');
 store.setState({patients:{},dictations:{}});reads.length=0;await store.getState().open(id);
 assert.equal(store.getState().dictations[id].generatedReport,'Synthetic manual draft');assert.deepEqual(reads,[]);assert.equal(originalBytes.size,0);
});
test('existing build106 case remains readable; editing saves independently without mutating original bytes',async()=>{
 const old=JSON.parse(fs.readFileSync(savedFile(id),'utf8'));old.dictation.id='newcase-old-synthetic-106';old.dictation.generatedReport='Prior saved report';
 const {summaryOf}=require('../src/services/newPatientCases.ts');originalBytes.set(CASE_INDEX_KEY,JSON.stringify({version:1,cases:[summaryOf(old)]}));originalBytes.set(CASE_PREFIX+old.dictation.id,JSON.stringify(old));const before=[...originalBytes];
 await store.getState().open(old.dictation.id);store.getState().updateDictation(old.dictation.id,{generatedReport:'New verified edit'});await store.getState().flush();
 assert.deepEqual([...originalBytes],before);assert.equal((await caseRepository.load(old.dictation.id)).dictation.generatedReport,'New verified edit');
 assert.ok((await caseRepository.list()).some(row=>row.id===id));
});
test('broken shared index cannot block saving, finalizing or reopening the independent recovery copy',async()=>{
 primaryBroken=true;id=Object.keys(store.getState().dictations)[0];
 store.getState().updateDictation(id,{generatedReport:'Synthetic finalized result'});store.getState().finalizeDictation(id);await store.getState().flush();
 assert.equal(store.getState().saveError,null);assert.equal((await caseRepository.load(id)).dictation.status,'final');
 assert.ok((await caseRepository.list()).some(row=>row.id===id));primaryBroken=false;
});
test('real write failure preserves the last file, exposes a specific cause, and same-case retry verifies recovery',async()=>{
 const before=fs.readFileSync(savedFile(id),'utf8');diskFull=true;
 store.getState().updateDictation(id,{generatedReport:'Unsaved latest text',status:'draft'});
 await assert.rejects(store.getState().flush());assert.match(store.getState().saveError,/DEVICE_FULL/);
 assert.equal(fs.readFileSync(savedFile(id),'utf8'),before);await assert.rejects(store.getState().start(input,''));
 diskFull=false;await store.getState().retrySave();assert.equal(store.getState().saveError,null);
 assert.equal((await caseRepository.load(id)).dictation.generatedReport,'Unsaved latest text');
});
test('a successful write callback is not considered Saved if the independent readback fails',async()=>{
 // Isolated namespace avoids altering the preceding saved cases.
 const {createVerifiedCaseRepository}=require('../src/services/newCasePersistence.ts');const {createCaseRepository}=require('../src/services/newPatientCases.ts');
 const data=new Map();const corrupted={getItem:async k=>data.get(k)??null,setItem:async(k,v)=>data.set(k,k===CASE_INDEX_KEY?v:'broken')};
 const repo=createVerifiedCaseRepository(createCaseRepository(primary),createCaseRepository(corrupted));
 const value=JSON.parse(fs.readFileSync(savedFile(id),'utf8'));await assert.rejects(repo.save(value),/VERIFY/);
});
test('oversized attachments give an actionable error; unrelated paths and oversized recovery reads are rejected',async()=>{
 const before=fs.readFileSync(savedFile(id),'utf8');const d=store.getState().dictations[id];
 const big={id:'big',type:'image',content:'Synthetic',timestamp:new Date().toISOString(),imageBase64:'x'.repeat(8*1024*1024-100)};
 store.getState().updateDictation(id,{transcriptParts:[...d.transcriptParts,big]});await assert.rejects(store.getState().flush());assert.match(store.getState().saveError,/SIZE_LIMIT/);assert.equal(fs.readFileSync(savedFile(id),'utf8'),before);
 store.getState().updateDictation(id,{transcriptParts:d.transcriptParts});await store.getState().flush();
 await assert.rejects(createCaseFileStorage(files).getItem('../patient-dictations-store'),/recovery key/);
 const huge=createCaseFileStorage({...files,getInfoAsync:async()=>({exists:true,isDirectory:false,size:9*1024*1024}),readAsStringAsync:async()=>assert.fail('must not allocate oversized file')});await assert.rejects(huge.getItem(CASE_PREFIX+id));
});
test('operation-date default uses the device-local creation day across UTC midnight',()=>{
 const old=process.env.TZ;process.env.TZ='Pacific/Honolulu';try{assert.equal(localOperationDate('2026-11-06T02:30:00.000Z'),'2026-11-05');}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
after(()=>fs.rmSync(root,{recursive:true,force:true}));
