const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),express=require('express');
const {installJobs,jobContext}=require('./operative-jobs');
const {preserveAndWrite}=require('./clinical-preservation');
async function fixture(t,handlers,dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo-jobs-'))){
 const app=express();app.use(express.json());
 app.use((req,res,next)=>{res.set('Cache-Control','no-store');if(req.headers.authorization!=='Bearer test')return res.sendStatus(401);next();});
 installJobs(app,{dataDir:dir,handlers,cacheVersion:()=>['test']});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 async function call(url,body,token='test'){const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json().catch(()=>null),headers:r.headers};}
 return {dir,call};
}
const tick=()=>new Promise(r=>setTimeout(r,15));
test('acknowledges immediately, deduplicates in-flight retries, exposes progress, persists encrypted result across restart',async t=>{
 let release,calls=0;const gate=new Promise(r=>release=r);
 const handlers={'/analyze':async(req,res)=>{calls++;jobContext.getStore().update('analysis');await gate;res.json({facts:['SYNTHETIC_PRIVATE_NOTE']});}};
 const f=await fixture(t,handlers);const body={operation:'/analyze',input:{caseId:'test',text:'SYNTHETIC_PRIVATE_NOTE'},retry:true};
 assert.equal((await f.call('/jobs',body,'wrong')).status,401);
 const a=await f.call('/jobs',body);assert.equal(a.status,202);assert.equal(a.body.status,'running');
 const duplicate=await f.call('/jobs',body);assert.equal(duplicate.body.id,a.body.id);assert.equal(calls,1);
 assert.equal((await f.call('/jobs/'+a.body.id)).body.stage,'analysis');
 release();await tick();const done=await f.call('/jobs/'+a.body.id);assert.equal(done.body.status,'completed');
 assert.equal(done.headers.get('cache-control'),'no-store');
 assert.ok(!fs.readFileSync(path.join(f.dir,'operative-jobs',a.body.id+'.json'),'utf8').includes('SYNTHETIC_PRIVATE_NOTE'));
 const g=await fixture(t,handlers,f.dir);assert.deepEqual((await g.call('/jobs',body)).body.result,done.body.result);assert.equal(calls,1);
 await g.call('/jobs',{...body,input:{...body.input,text:'corrected note'}});await tick();assert.equal(calls,2);
});
test('failed jobs retry only on request; errors redacted; stale running jobs can be recovered after restart',async t=>{
 let calls=0;const f=await fixture(t,{'/draft':async(req,res)=>{if(++calls===1)throw Error('secret provider body');res.json({report:'good'});}});
 const body={operation:'/draft',input:{sessionId:'test'}};
 const a=await f.call('/jobs',body);await tick();const failure=await f.call('/jobs/'+a.body.id);assert.equal(failure.body.status,'failed');assert.ok(!failure.body.error.includes('secret'));
 await f.call('/jobs',body);assert.equal(calls,1);
 await f.call('/jobs',{...body,retry:true});await tick();assert.equal(calls,2);assert.equal((await f.call('/jobs/'+a.body.id)).body.status,'completed');
 preserveAndWrite(path.join(f.dir,'operative-jobs',a.body.id+'.json'),{id:a.body.id,status:'running'});
 assert.equal((await f.call('/jobs/'+a.body.id)).body.status,'failed');
 await f.call('/jobs',{...body,retry:true});await tick();assert.equal(calls,3);
});
test('bounded concurrency rejects excess jobs but allows reattaching; invalid operation cannot mutate profiles',async t=>{
 let release;const gate=new Promise(r=>release=r);
 const f=await fixture(t,{'/ocr':async(req,res)=>{await gate;res.json({text:'synthetic'});}});
 const a=await f.call('/jobs',{operation:'/ocr',input:{n:1}});
 await f.call('/jobs',{operation:'/ocr',input:{n:2}});
 assert.equal((await f.call('/jobs',{operation:'/ocr',input:{n:3}})).status,429);
 assert.equal((await f.call('/jobs',{operation:'/ocr',input:{n:1}})).body.id,a.body.id);
 assert.equal((await f.call('/jobs',{operation:'/profiles',input:{}})).status,400);
 assert.equal((await f.call('/jobs/invalid')).status,400);release();await tick();
});
