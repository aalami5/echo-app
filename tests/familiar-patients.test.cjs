const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const original=Module._load;
Module._load=function(id,...args){if(/\/(patientsStore|patientDictationsStore|patientSync|dictationSync|clinicalRestore|emailReceipts)$/.test(id))assert.fail('metadata must not import '+id);return original.call(this,id,...args);};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {createPatientViewRepository,mergePatientView,patientListItems,PATIENT_VIEW_KEY}=require('../src/services/familiarPatients.ts');
const {createCaseRepository,summaryOf,CASE_INDEX_KEY}=require('../src/services/newPatientCases.ts');
const patient={id:'newpatient-synthetic',name:'Synthetic Patient',mrn:'TEST-ONLY',dob:'',room:'R12',chiefComplaint:'Synthetic complaint',hospital:'SEQ',callDayId:'day',timeSeen:'2026-11-03T10:00:00Z',date:'2026-11-03'};
test('patient-first save persists metadata only, preserves all old keys, serializes edits and retains bytes on failure',async()=>{
 const map=new Map([['echo-patients','unchanged'],['patient-dictations-store','archive'],['operative-email-receipts-v1','uncertain']]);const touched=[];let fail=false;
 const repo=createPatientViewRepository({getItem:async k=>{assert.equal(k,PATIENT_VIEW_KEY);return map.get(k)??null;},setItem:async(k,v)=>{assert.equal(k,PATIENT_VIEW_KEY);if(fail)throw Error('full');touched.push(k);map.set(k,v);}});
 await repo.save(patient);assert.equal((await repo.list())[0].room,'R12');
 await Promise.all([repo.save({...patient,room:'R13'}),repo.save({...patient,room:'R14'})]);assert.equal((await repo.list())[0].room,'R14');
 const before=[...map];fail=true;await assert.rejects(repo.save({...patient,room:'R15'}),/full/);assert.deepEqual([...map],before);
 fail=false;await repo.save({...patient,room:'R15'});assert.equal((await repo.list())[0].room,'R15');assert.equal(map.get('patient-dictations-store'),'archive');
 assert.throws(()=>repo.save({...patient,date:'2026-02-31'}));map.set(PATIENT_VIEW_KEY,'broken');const writes=touched.length;await assert.rejects(repo.save(patient));assert.equal(touched.length,writes);
});
test('unified dates/hospitals/cards respect phone overlay, keep every report ID and support build104 index without report reads',()=>{
 const old={...patient,id:'old-synthetic',source:'phone'};
 const report={id:'newcase-synthetic0000',patientId:old.id,name:old.name,mrn:old.mrn,date:'2026-11-02',updatedAt:'2026-11-03',status:'final'};
 const unknown={...report,id:'newcase-synthetic0001',patientId:'build104-patient'};
 const rows=mergePatientView([old],[{...old,room:'Edited locally',source:undefined}],[report,unknown,{...report,id:'newcase-synthetic0002',status:'draft'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].room,'Edited locally');assert.equal(rows[0].archived,true);assert.equal(rows[0].reports.length,2);assert.equal(rows[1].hospital,null);
 const collapsed=patientListItems(rows,new Set(),'');assert.equal(collapsed.filter(x=>x.kind==='patient').length,0);
 const expanded=patientListItems(rows,new Set(['2026-11-03']),'');assert.equal(expanded.filter(x=>x.kind==='patient').length,1);
 const search=patientListItems(rows,new Set(),'Edited locally');assert.equal(search.filter(x=>x.kind==='patient').length,1);
});
test('enriched summary validates metadata and rejects an oversized index before writing a case',async()=>{
 const dictation={id:'newcase-synthetic0000',patientId:patient.id,dateOfOperation:'2026-11-03',status:'draft',createdAt:'2026-11-03',updatedAt:'2026-11-03',transcriptParts:[{id:'newcase-synthetic0000-header',type:'text',content:'Synthetic header',timestamp:'2026-11-03'}],selectedProcedures:[],generatedReport:null};
 const value={version:1,patient,dictation};assert.equal(summaryOf(value).hasContent,false);assert.equal(summaryOf(value).patient.room,'R12');
 const big=Array.from({length:4999},(_,i)=>({...summaryOf(value),id:'newcase-synthetic'+String(i).padStart(10,'0'),patient:{...patient,chiefComplaint:'x'.repeat(4000)}}));
 const map=new Map([[CASE_INDEX_KEY,JSON.stringify({version:1,cases:big})]]);const writes=[];
 const repo=createCaseRepository({getItem:async k=>map.get(k)??null,setItem:async(k,v)=>writes.push([k,v])});
 await assert.rejects(repo.save(value));assert.equal(writes.length,0);
});
