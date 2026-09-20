const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {mergePatients,mergeDictations,readClinical,preserveAndWrite}=require('./clinical-preservation');
const patientState=()=>({patients:{p:{id:'p',name:'Synthetic Person',mrn:'TEST',callDayId:'day'}},callDays:{day:{id:'day',date:'2026-09-19',patientIds:['p']}},callDayOrder:['day']});
test('empty new phone and partial phone snapshot cannot erase existing patients',()=>{
 const data=patientState();
 assert.deepEqual(mergePatients(data,{patients:{},callDays:{},callDayOrder:[]}),data);
 const next=mergePatients(data,{patients:{q:{id:'q',name:'Second Synthetic',callDayId:'day'}},callDays:{day:{...data.callDays.day,patientIds:['q']}},callDayOrder:['day']});
 assert.equal(Object.keys(next.patients).length,2);assert.deepEqual(next.callDays.day.patientIds,['p','q']);
});
test('empty uploads and stale report revisions never remove saved reports',()=>{
 const current={dictations:{r:{id:'r',generatedReport:'Newer',updatedAt:'2026-09-19'}}};
 assert.deepEqual(mergeDictations(current,{}),current);
 assert.deepEqual(mergeDictations(current,{r:{id:'r',generatedReport:'Old',updatedAt:'2026-09-18'}}),current);
 assert.equal(mergeDictations(current,{draft:{id:'draft',status:'draft'}}).dictations.draft.status,'draft');
});
test('invalid patient references are rejected before writing',()=>{
 assert.throws(()=>mergePatients(patientState(),{patients:{q:{id:'q',callDayId:'missing'}},callDays:{},callDayOrder:[]}));
});
test('encrypted current data and historical snapshots survive restart; corruption fails closed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo-clinical-test-'));
 const file=path.join(dir,'patients.json');
 const before=patientState();fs.writeFileSync(file,JSON.stringify(before));
 preserveAndWrite(file,before);
 assert.equal(readClinical(file).patients.p.name,'Synthetic Person');
 assert.ok(!fs.readFileSync(file,'utf8').includes('Synthetic Person'));
 const backup=path.join(dir,'clinical-history',fs.readdirSync(path.join(dir,'clinical-history'))[0]);
 // History uses the same owner-only key in its parent's parent, by design.
 process.env.CLINICAL_KEY_FILE=path.join(dir,'.clinical-storage-key');
 try { assert.deepEqual(readClinical(backup),before); } finally {delete process.env.CLINICAL_KEY_FILE;}
 const envelope=JSON.parse(fs.readFileSync(file));envelope.tag=Buffer.alloc(16).toString('base64');fs.writeFileSync(file,JSON.stringify(envelope));
 assert.throws(()=>readClinical(file));
 assert.equal(fs.statSync(path.join(dir,'.clinical-storage-key')).mode & 0o777,0o600);
});
