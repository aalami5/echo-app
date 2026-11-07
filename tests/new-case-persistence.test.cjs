const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,os=require('node:os'),path=require('node:path'),ts=require('typescript'),Module=require('node:module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'echo-case-save-')),originalBytes=new Map(),reads=[],writes=[];
let primaryBroken=false,diskFull=false,corruptWrites=false,imagesFull=false;
const primary={getItem:async key=>{assert.match(key,/^echo-new-patient-case/);reads.push(key);if(primaryBroken)throw Error('primary index unavailable');return originalBytes.get(key)??null;},setItem:async()=>assert.fail('original storage must stay read-only')};
const files={documentDirectory:root+'/',EncodingType:{UTF8:'utf8'},getInfoAsync:async file=>{try{const s=await fsp.stat(file);return {exists:true,size:s.size,isDirectory:s.isDirectory()};}catch(e){if(e.code==='ENOENT')return {exists:false};throw e;}},readAsStringAsync:async file=>fsp.readFile(file,'utf8'),makeDirectoryAsync:async dir=>fsp.mkdir(dir,{recursive:true}),writeAsStringAsync:async(file,value)=>{if(diskFull||(imagesFull&&file.endsWith('.b64')))throw Error('ENOSPC: disk full');writes.push(file);await fsp.writeFile(file+'.tmp',corruptWrites&&file.endsWith('.b64')?'invalid':value);await fsp.rename(file+'.tmp',file);}};
const original=Module._load;Module._load=function(id,...args){
 if(id==='@react-native-async-storage/async-storage')return {__esModule:true,default:primary};
 if(id==='expo-file-system/legacy')return files;
 if(id==='expo-crypto')return {randomUUID:require('node:crypto').randomUUID,CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(alg,text)=>require('node:crypto').createHash(alg).update(text).digest('hex')};
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
test('71 MiB case including a 17 MiB image saves losslessly and reopens through a fresh repository',async()=>{
 const d=store.getState().dictations[id],before=[...originalBytes];
 const big={id:'big',type:'image',content:'Synthetic',timestamp:new Date().toISOString(),imageBase64:'x'.repeat(17*1024*1024),imageMimeType:'image/png',ocrText:'Preserved synthetic OCR'};
 const second={...big,id:'second',imageBase64:'y'.repeat(3*1024*1024)};
 const extra=Array.from({length:3},(_,i)=>({...big,id:'extra-'+i}));
 const {createCaseRepository:oldRepository}=require('../src/services/newPatientCases.ts');
 assert.throws(()=>oldRepository(primary).save({version:1,patient:store.getState().patients[d.patientId],dictation:{...d,transcriptParts:[...d.transcriptParts,big,second,...extra]}}),/too large/);
 store.getState().updateDictation(id,{transcriptParts:[...d.transcriptParts,big,second,...extra],generatedReport:'Latest synthetic operative report'});await store.getState().flush();
 assert.equal(store.getState().saveError,null);const expected=structuredClone(store.getState().dictations[id]);
 const manifest=fs.readFileSync(savedFile(id),'utf8');assert.ok(Buffer.byteLength(manifest)<10000);assert.match(manifest,/echo-case-image-v1:/);assert.ok(!manifest.includes(big.imageBase64));
 const {createAttachmentCaseRepository,createCaseAttachmentStorage}=require('../src/services/caseAttachments.ts');
 const {createCaseRepository}=require('../src/services/newPatientCases.ts');
 const {createVerifiedCaseRepository}=require('../src/services/newCasePersistence.ts');
 const fresh=createVerifiedCaseRepository(createCaseRepository(primary),createAttachmentCaseRepository(createCaseRepository(createCaseFileStorage(files)),createCaseAttachmentStorage(files)));
 assert.deepEqual((await fresh.load(id)).dictation,expected);assert.deepEqual([...originalBytes],before);
 const originalRead=files.readAsStringAsync;const imageReads=[];files.readAsStringAsync=async uri=>{imageReads.push(uri);return originalRead(uri);};
 try{await fresh.list();assert.ok(imageReads.every(x=>!x.endsWith('.b64')));}finally{files.readAsStringAsync=originalRead;}
 const count=fs.readdirSync(path.join(root,'echo-new-case-images-v1')).length;
 store.getState().updateDictation(id,{generatedReport:'Latest edit with unchanged images'});await store.getState().flush();
 assert.equal(fs.readdirSync(path.join(root,'echo-new-case-images-v1')).length,count);
 store.getState().updateDictation(id,{transcriptParts:d.transcriptParts});await store.getState().flush();
});
test('unrelated paths and oversized recovery reads are rejected before allocation',async()=>{
 await assert.rejects(createCaseFileStorage(files).getItem('../patient-dictations-store'),/recovery key/);
 const huge=createCaseFileStorage({...files,getInfoAsync:async()=>({exists:true,isDirectory:false,size:17*1024*1024}),readAsStringAsync:async()=>assert.fail('must not allocate oversized file')});await assert.rejects(huge.getItem(CASE_PREFIX+id));
});
test('attachment write failure preserves previous report; retry commits and missing/corrupt files never silently fall back',async()=>{
 const previous=fs.readFileSync(savedFile(id),'utf8'),d=store.getState().dictations[id];
 const part={id:'failure-image',type:'image',content:'Synthetic',timestamp:new Date().toISOString(),imageBase64:'c3ludGhldGlj',imageMimeType:'image/png'};
 diskFull=true;store.getState().updateDictation(id,{transcriptParts:[...d.transcriptParts,part],generatedReport:'Pending image draft'});
 await assert.rejects(store.getState().flush());assert.match(store.getState().saveError,/DEVICE_FULL/);assert.equal(fs.readFileSync(savedFile(id),'utf8'),previous);
 diskFull=false;await store.getState().retrySave();assert.equal(store.getState().saveError,null);
 const hash=require('node:crypto').createHash('sha256').update(part.imageBase64).digest('hex'),file=path.join(root,'echo-new-case-images-v1',hash+'.b64');
 fs.writeFileSync(file,'x'.repeat(part.imageBase64.length));assert.equal((await caseRepository.load(id)).textRecovery,true);
 await store.getState().retrySave();assert.equal(store.getState().saveError,null);assert.equal(fs.readFileSync(file,'utf8'),part.imageBase64);
 fs.unlinkSync(file);assert.equal((await caseRepository.load(id)).textRecovery,true);
 await store.getState().retrySave();assert.equal((await caseRepository.load(id)).dictation.generatedReport,'Pending image draft');
 store.getState().updateDictation(id,{transcriptParts:d.transcriptParts});await store.getState().flush();
});
test('corrupt attachment write cannot replace the last verified report manifest',async()=>{
 const before=fs.readFileSync(savedFile(id),'utf8'),d=store.getState().dictations[id];
 corruptWrites=true;store.getState().updateDictation(id,{transcriptParts:[...d.transcriptParts,{id:'corrupt',type:'image',content:'Synthetic',timestamp:new Date().toISOString(),imageBase64:'YW5vdGhlciBzeW50aGV0aWM='}]});
 await assert.rejects(store.getState().flush());assert.match(store.getState().saveError,/ATTACHMENT_READ/);assert.equal(fs.readFileSync(savedFile(id),'utf8'),before);
 corruptWrites=false;await store.getState().retrySave();assert.equal(store.getState().saveError,null);
 store.getState().updateDictation(id,{transcriptParts:d.transcriptParts});await store.getState().flush();
});
test('sidecar reference traversal and aggregate allocation attacks are rejected before image reads',async()=>{
 const {createAttachmentCaseRepository}=require('../src/services/caseAttachments.ts');
 const value=JSON.parse(fs.readFileSync(savedFile(id),'utf8'));
 let reads=0;const repo=createAttachmentCaseRepository({load:async()=>structuredClone(value),list:async()=>[],save:async()=>{}},{read:async()=>{reads++;assert.fail('must not read');}});
 value.dictation.transcriptParts=[{id:'invalid',type:'image',content:'Synthetic',timestamp:'2026-11-06',imageBase64:'echo-case-image-v1:../../private:10'}];
 await assert.rejects(repo.load(id),/ATTACHMENT_READ/);assert.equal(reads,0);
 value.dictation.transcriptParts=Array.from({length:9},(_,i)=>({id:String(i),type:'image',content:'Synthetic',timestamp:'2026-11-06',imageBase64:'echo-case-image-v1:'+'a'.repeat(64)+':16777216'}));
 await assert.rejects(repo.load(id),/ATTACHMENT_LIMIT/);assert.equal(reads,0);
});
test('saving beyond attachment memory budget rejects before writing and reports an app limit, not device full',async()=>{
 const {createAttachmentCaseRepository}=require('../src/services/caseAttachments.ts');
 const value=JSON.parse(fs.readFileSync(savedFile(id),'utf8'));let writes=0;
 const repo=createAttachmentCaseRepository({load:async()=>value,list:async()=>[],save:async()=>writes++},{write:async()=>{writes++;}});
 value.dictation.transcriptParts=Array.from({length:9},(_,i)=>({id:String(i),type:'image',content:'Synthetic',timestamp:'2026-11-06',imageBase64:'a'.repeat(16*1024*1024)}));
 await assert.rejects(repo.save(value),/ATTACHMENT_LIMIT/);assert.equal(writes,0);
});
test('storage errors distinguish report limit, list capacity and physical disk full',()=>{
 const {caseSaveMessage,CasePersistenceError}=require('../src/services/newCasePersistence.ts');const {CaseLimitError}=require('../src/services/newPatientCases.ts');
 assert.match(caseSaveMessage(new CasePersistenceError('RECOVERY_WRITE',new CaseLimitError('CASE_LIST_LIMIT','full'))),/CASE_LIST_LIMIT/);
 assert.match(caseSaveMessage(new CasePersistenceError('RECOVERY_WRITE',new CaseLimitError('REPORT_SIZE_LIMIT','too large'))),/REPORT_SIZE_LIMIT/);
 assert.match(caseSaveMessage(new CasePersistenceError('RECOVERY_WRITE',Error('ENOSPC'))),/DEVICE_FULL/);
});
test('attachment failure protects latest text before image writes, survives cold reopen and cannot masquerade as complete',async()=>{
 const old=fs.readFileSync(savedFile(id),'utf8'),d=store.getState().dictations[id];
 const part={id:'text-first',type:'image',content:'Synthetic image note',ocrText:'Preserved extracted notes',timestamp:new Date().toISOString(),imageBase64:'dGV4dC1maXJzdC1pbWFnZQ=='};
 imagesFull=true;writes.length=0;store.getState().updateDictation(id,{transcriptParts:[...d.transcriptParts,part],generatedReport:'Latest protected report text'});
 await assert.rejects(store.getState().flush());assert.match(store.getState().saveError,/text and notes are protected/);assert.match(store.getState().saveError,/DEVICE_FULL/);
 assert.equal(fs.readFileSync(savedFile(id),'utf8'),old);assert.match(writes[0],/echo-new-case-text-v1/);
 const cold=await caseRepository.load(id);assert.equal(cold.textRecovery,true);assert.equal(cold.dictation.generatedReport,'Latest protected report text');
 const recovered=cold.dictation.transcriptParts.at(-1);assert.equal(recovered.ocrText,part.ocrText);assert.equal(recovered.imageBase64,undefined);assert.equal(recovered.imageMissing,true);
 const storePath=require.resolve('../src/stores/newPatientCasesStore.ts'),cached=require.cache[storePath];delete require.cache[storePath];
 try {
   const coldStore=require(storePath).useNewPatientCasesStore;await coldStore.getState().open(id);
   assert.match(coldStore.getState().saveError,/TEXT_RECOVERED/);assert.equal(coldStore.getState().savedAt,null);
   await assert.rejects(coldStore.getState().retrySave());assert.match(coldStore.getState().saveError,/TEXT_RECOVERED/);
 } finally {require.cache[storePath]=cached;}
 imagesFull=false;await store.getState().retrySave();const complete=await caseRepository.load(id);
 assert.equal(complete.textRecovery,undefined);assert.equal(complete.dictation.transcriptParts.at(-1).imageBase64,part.imageBase64);assert.equal(store.getState().saveError,null);
 store.getState().updateDictation(id,{transcriptParts:d.transcriptParts});await store.getState().flush();
});
test('new allowance permits a 9 MiB report-data record and more than 500 cases',async()=>{
 const {createCaseRepository,CASE_COUNT}=require('../src/services/newPatientCases.ts');
 const value=JSON.parse(fs.readFileSync(savedFile(id),'utf8'));delete value.saveId;
 value.dictation.reportReview={syntheticPadding:'s'.repeat(9*1024*1024)};await caseRepository.save(value);
 assert.equal((await caseRepository.load(id)).dictation.reportReview.syntheticPadding.length,9*1024*1024);
 delete value.dictation.reportReview;await caseRepository.save(value);
 const map=new Map(),repo=createCaseRepository({getItem:async k=>map.get(k)??null,setItem:async(k,v)=>map.set(k,v)});
 const {summaryOf}=require('../src/services/newPatientCases.ts');
 const summary=summaryOf(value),rows=Array.from({length:500},(_,i)=>({...summary,id:'newcase-seeded-case-'+String(i).padStart(8,'0')}));
 map.set(CASE_INDEX_KEY,JSON.stringify({version:1,cases:rows}));await repo.save(value);
 assert.equal((await repo.list()).length,501);assert.equal(CASE_COUNT,5000);
});
test('successful newer complete save supersedes an older text checkpoint when checkpoint storage fails',async()=>{
 const {createVerifiedCaseRepository}=require('../src/services/newCasePersistence.ts');const {createCaseRepository}=require('../src/services/newPatientCases.ts');
 const full=new Map(),text=new Map();let textFailed=false;
 const fullRepo=createCaseRepository({getItem:async k=>full.get(k)??null,setItem:async(k,v)=>full.set(k,v)});
 const textRepo=createCaseRepository({getItem:async k=>text.get(k)??null,setItem:async(k,v)=>{if(textFailed)throw Error('text location read-only');text.set(k,v);}});
 const repo=createVerifiedCaseRepository(createCaseRepository(primary),fullRepo,textRepo);
 const value=JSON.parse(fs.readFileSync(savedFile(id),'utf8'));value.dictation.generatedReport='Old text';await repo.save(value);
 textFailed=true;value.dictation.generatedReport='New complete report';await repo.save(value);
 assert.equal((await repo.load(id)).dictation.generatedReport,'New complete report');assert.equal((await repo.load(id)).textRecovery,undefined);
});
test('operation-date default uses the device-local creation day across UTC midnight',()=>{
 const old=process.env.TZ;process.env.TZ='Pacific/Honolulu';try{assert.equal(localOperationDate('2026-11-06T02:30:00.000Z'),'2026-11-05');}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
after(()=>fs.rmSync(root,{recursive:true,force:true}));
