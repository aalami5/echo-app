// Opt-in production smoke test, SYNTHETIC ONLY. Does not create a patient/report record.
const fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.OPERATIVE_TEST_URL||'https://echo.oppersmedical.com';
const started=Date.now();let pollCount=0;
async function request(p,b){
 const r=await fetch(base+'/patients/operative'+p,{method:b===undefined?'GET':'POST',headers:{Authorization:'Bearer '+process.env.AUTH_TOKEN,'Content-Type':'application/json'},body:b===undefined?undefined:JSON.stringify(b),signal:AbortSignal.timeout(20000)});
 const j=await r.json();if(!r.ok)throw Error(`HTTP ${r.status}: ${j.error}`);return j;
}
async function job(operation,input){
 const body={operation,input,retry:true};const begun=Date.now();
 let j=await request('/jobs',body);const id=j.id;
 // Simulates losing the submission response and reconnecting to the same work.
 assert.equal((await request('/jobs',body)).id,id);
 while(j.status==='running'){
  if(Date.now()-begun>110000)throw Error('Job exceeded deadline');
  await new Promise(r=>setTimeout(r,500));j=await request('/jobs/'+id);pollCount++;
 }
 assert.equal(j.status,'completed',j.error);assert.deepEqual((await request('/jobs',body)).result,j.result);
 console.log(JSON.stringify({operation,elapsedMs:Date.now()-begun,reconnected:true}));
 return j.result;
}
(async()=>{
 assert.equal((await fetch(base+'/patients/operative/jobs/invalid')).status,401);
 const sources=[];
 for(let i=0;i<3;i+=2)await Promise.all([i,i+1].filter(n=>n<3).map(async n=>{
  const r=await job('/ocr',{mimeType:'image/png',imageBase64:fs.readFileSync(`${process.env.OPERATIVE_FIXTURE_PREFIX||"/tmp/echo79-page"}-${n+1}.png`).toString('base64')});
  sources[n]={id:`page${n+1}`,kind:'ocr',text:r.text,warnings:r.warnings};
 }));
 const a=await job('/analyze',{caseId:'synthetic-build79-public-smoke-'+(process.env.CASE_RUN||'default'),sources,customProcedures:[],selectedProcedures:[]});
 const d=await job('/draft',{sessionId:a.id,confirmedSteps:[],stylePreferences:[]});
 const narrative=d.report.split('**Open Items:**')[0];
 assert.match(narrative,/7\s*(Fr|French)/i);assert.match(narrative,/0\.018/);assert.match(narrative,/100/);assert.match(narrative,/15\s*mL/i);
 assert.match(narrative,/no stent|stent was not/i);assert.ok(!/(?:a |the )6\s*(?:Fr|French)\s+sheath\s+was\s+(?:placed|used|inserted)/i.test(narrative),'Must not assert placement of the 6 Fr sheath');
 if(process.env.OPERATIVE_FIXTURE_PREFIX){assert.ok(d.review.every(v=>/source |synthetic|OCR|truncat/i.test(v)),'Only synthetic fixture/source warnings are expected');}else assert.equal(d.review.length,0);assert.ok(d.statements.length>8);
 console.log(JSON.stringify({result:'passed',screenshots:3,facts:a.facts.length,statements:d.statements.length,reviewItems:d.review.length,pollCount,elapsedMs:Date.now()-started}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
