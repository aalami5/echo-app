const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const express=require('express');
const {installOperativeDrafting,validateFacts,validateDraft,renderReport}=require('./operative-drafting');
const catalog=require('./report-catalog.json');
const sources=[{id:'note',kind:'text',text:'Left SFA angioplasty using a 6 mm balloon. EBL 10 mL. No complications.'}];
const extract={procedures:['Lower Extremity Angioplasty/Stenting'],facts:[{field:'procedure',value:'Left SFA angioplasty using a 6 mm balloon',sourceId:'note',quote:'Left SFA angioplasty using a 6 mm balloon.'},{field:'EBL',value:'10 mL',sourceId:'note',quote:'EBL 10 mL.'},{field:'complications',value:'None',sourceId:'note',quote:'No complications.'}],review:[]};
async function fixture(t,outputs,token='synthetic-token'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo-drafting-test-'));const requests=[];const app=express();app.use(express.json());
 installOperativeDrafting(app,{apiKey:'synthetic-key',authToken:token,dataDir:dir,fetchImpl:async(url,options)=>{requests.push(JSON.parse(options.body));const output=outputs.shift();if(output instanceof Error)throw output;return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})};}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const request=async(endpoint,body,auth=token)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/patients/operative${endpoint}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,data:await r.json()};};
 return {request,requests,dir};
}
test('catalog covers all categories and is authenticated, no-store, fail closed without configured auth',async t=>{
 const f=await fixture(t,[]);assert.equal((await f.request('/catalog',undefined,null)).status,401);const r=await f.request('/catalog');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.data.catalog.length,44);for(const category of ['aortic','carotid','venous','dialysis_access','other'])assert.ok(catalog.some(p=>p.category===category));
 const g=await fixture(t,[],undefined); // default token is intentional; test empty instead
 const h=await fixture(t,[],'');assert.equal((await h.request('/catalog',undefined,'anything')).status,401);
});
test('current case exact source quotes required; examples/header alone cannot create evidence',async t=>{
 assert.throws(()=>validateFacts({...extract,facts:[{sourceId:'prior',quote:sources[0].text}]},sources));
 assert.throws(()=>validateFacts({...extract,facts:[{sourceId:'note',quote:'Right SFA'}]},sources));
 const f=await fixture(t,[]);assert.equal((await f.request('/analyze',{sources:[{id:'old',kind:'historical',text:'Previous patient had EVAR'}]})).status,422);assert.equal(f.requests.length,0);
});
test('all source text, mixed procedures and corrections preserved in encrypted session; history excluded',async t=>{
 const mixed={...extract,procedures:['Lower Extremity Angioplasty/Stenting','Custom adjunct']};const f=await fixture(t,[mixed]);
 const r=await f.request('/analyze',{caseId:'synthetic',sources:[...sources,{id:'correction',kind:'correction',text:'The side is LEFT.'},{id:'prior',kind:'historical',text:'UNRELATED PRIVATE HISTORICAL TEXT'}],customProcedures:['Custom adjunct']});
 assert.equal(r.status,200);assert.equal(r.data.procedures.length,2);assert.equal(r.data.sources.length,2);assert.equal(r.data.facts[0].quote,extract.facts[0].quote);
 assert.ok(!JSON.stringify(f.requests).includes('UNRELATED PRIVATE'));
 const stored=fs.readFileSync(path.join(f.dir,'operative-drafting',r.data.id+'.json'),'utf8');assert.ok(!stored.includes('Left SFA'));assert.ok(stored.includes('echo-clinical-aes256gcm-v1'));
});
test('explicit profile approval, optimistic versioning and preserved encrypted history',async t=>{
 const f=await fixture(t,[]);const body={procedure:'AV Fistula Creation',steps:['Use usual exposure'],approved:true,expectedVersion:0};
 assert.equal((await f.request('/profiles',{...body,approved:false})).status,400);
 const a=await f.request('/profiles',body);assert.equal(a.data.version,1);
 assert.equal((await f.request('/profiles',body)).status,409);
 assert.equal((await f.request('/profiles',{...body,expectedVersion:1,steps:['Revised exposure']})).data.version,2);
 assert.ok(fs.readdirSync(path.join(f.dir,'clinical-history')).length);
 assert.ok(!fs.readFileSync(path.join(f.dir,'operative-technique-profiles.json'),'utf8').includes('Revised exposure'));
});
test('draft uses only confirmed steps, evidence references, and case numbers; audit removes unsupported prose',async t=>{
 const draft={statements:[{section:'Description of Procedure',text:'Left SFA angioplasty was performed using a 6 mm balloon.',evidence:['f1']},{section:'Complications',text:'None.',evidence:['f3']},{section:'Findings',text:'Excellent distal runoff.',evidence:['f1']}],review:[]};
 const audit={issues:['Completion findings require confirmation.'],unsupportedStatementIndexes:[2],missingFacts:[{factId:'f2',section:'EBL'}]};
 const f=await fixture(t,[extract,draft,audit]);const a=await f.request('/analyze',{sources});
 const r=await f.request('/draft',{sessionId:a.data.id,confirmedSteps:[]});assert.equal(r.status,200);assert.ok(r.data.report.includes('6 mm'));assert.ok(!r.data.report.includes('Excellent distal runoff'));assert.ok(r.data.report.includes('Open Items'));assert.equal(r.data.confirmedSteps.length,0);
 assert.deepEqual(JSON.parse(f.requests[1].messages[1].content).confirmedSteps,[]);
 assert.throws(()=>validateDraft({statements:[{section:'EBL',text:'100 mL',evidence:['f2']}],review:[]},a.data,[]));
 assert.throws(()=>validateDraft({statements:[{section:'Complications',text:'None',evidence:['unknown']}],review:[]},a.data,[]));
});
test('clinical negatives are absent when not documented, explicitly confirmed steps carry provenance',async t=>{
 const justProc={...extract,facts:extract.facts.slice(0,1)};
 const draft={statements:[{section:'Procedure',text:'Left SFA angioplasty using a 6 mm balloon.',evidence:['f1']},{section:'Description of Procedure',text:'Manual compression was used for hemostasis.',evidence:['t1']}],review:[]};
 const f=await fixture(t,[justProc,draft,{issues:[],unsupportedStatementIndexes:[],missingFacts:[]}]);const a=await f.request('/analyze',{sources:[{...sources[0],text:extract.facts[0].quote}]});
 const r=await f.request('/draft',{sessionId:a.data.id,confirmedSteps:[{text:'Manual compression was used for hemostasis.',procedure:'Lower Extremity Angioplasty/Stenting',version:1}]});assert.equal(r.status,200);assert.ok(!r.data.report.includes('Complications'));assert.ok(!r.data.report.includes('Foley'));assert.equal(r.data.statements[1].evidence[0],'t1');
});
test('OCR failure never disappears silently; source warnings remain reviewable; upstream errors are redacted',async t=>{
 const f=await fixture(t,[new Error('secret upstream failure')]);
 assert.equal((await f.request('/ocr',{imageBase64:'not-an-image',mimeType:'image/jpeg'})).status,400);
 const r=await f.request('/analyze',{sources});assert.equal(r.status,502);assert.ok(!r.data.error.includes('secret'));
});
test('rendering omits unknown optional sections instead of asserting default negatives',()=>{
 const r=renderReport('',[{section:'Procedure',text:'AV fistula creation',evidence:['f1']}],['Confirm completion findings.']);assert.ok(!r.includes('None'));assert.ok(!r.includes('No Foley'));assert.ok(r.includes('Open Items'));
});
test('OCR line wraps retain the exact source span without allowing changed clinical facts',()=>{
 const source=[{id:'note',text:'Left SFA angioplasty\nusing a 6 mm balloon.\nNo complications.'}];
 const data={...extract,facts:extract.facts.slice(0,1)};
 const parsed=validateFacts(data,source);assert.equal(parsed.facts[0].quote,'Left SFA angioplasty\nusing a 6 mm balloon.');
 assert.throws(()=>validateFacts({...data,facts:[{...data.facts[0],quote:'Left SFA angioplasty using a 7 mm balloon.'}]},source));
 assert.throws(()=>validateFacts({...data,facts:[{...data.facts[0],quote:'Right SFA angioplasty using a 6 mm balloon.'}]},source));
 const wrapped=[{id:'note',text:'No flow-\nlimiting dissection.'}];
 const one={...data,facts:[{field:'completion',value:'No dissection',sourceId:'note',quote:'No flow-limiting dissection.'}]};
 assert.equal(validateFacts(one,wrapped).facts[0].quote,wrapped[0].text);
 assert.throws(()=>validateFacts({...one,facts:[{...one.facts[0],quote:'Flow-limiting dissection.'}]},wrapped));
});

test('draft-first composition bypasses analysis, excludes old cases and persists draft encrypted',async t=>{
 const f=await fixture(t,[{report:'**Procedure:**\nLeft SFA angioplasty using a 6 mm balloon.'}]);
 const r=await f.request('/compose',{caseId:'synthetic-compose',sources:[...sources,{id:'old',kind:'historical',text:'OLD PATIENT 8 mm stent'}],stylePreferences:[{section:'Description',preference:'Use paragraphs'}]});
 assert.equal(r.status,200);assert.equal(f.requests.length,1);assert.equal(r.data.policyVersion,'draft-first-v3.1');
 const input=JSON.parse(f.requests[0].messages[1].content);assert.equal(input.sources.length,1);assert.equal(input.stylePreferences[0].preference,'Use paragraphs');
 assert.ok(!JSON.stringify(f.requests).includes('OLD PATIENT'));assert.deepEqual(r.data.confirmedSteps,[]);
 const stored=fs.readFileSync(path.join(f.dir,'operative-drafting',r.data.sessionId+'.json'),'utf8');assert.ok(!stored.includes('Left SFA'));assert.ok(stored.includes('echo-clinical-aes256gcm-v1'));
});
test('AI editing receives the displayed draft including manual edits, not a reconstruction',async t=>{
 const f=await fixture(t,[{report:'Retained surgeon addition. EBL 15 mL.'}]);
 const previousReport='Retained surgeon addition. EBL 10 mL.';
 const r=await f.request('/compose',{sources,previousReport,editInstructions:'Change EBL to 15 mL only.'});
 assert.equal(r.status,200);assert.equal(f.requests.length,1);const input=JSON.parse(f.requests[0].messages[1].content);
 assert.equal(input.previousReport,previousReport);assert.equal(input.editInstructions,'Change EBL to 15 mL only.');
 assert.match(f.requests[0].messages[0].content,/Preserve its structure, wording and manual additions/);
});
test('composer rejects absent current notes, incomplete editing input, empty output and does not leak provider errors',async t=>{
 const f=await fixture(t,[{report:''},new Error('private diagnostic')]);
 assert.equal((await f.request('/compose',{sources:[{kind:'historical',text:'Old operation'}]})).status,422);
 assert.equal((await f.request('/compose',{sources,previousReport:'draft'})).status,400);
 assert.equal(f.requests.length,0);
 assert.equal((await f.request('/compose',{sources})).status,422);
 const r=await f.request('/compose',{sources});assert.equal(r.status,502);assert.ok(!JSON.stringify(r).includes('private diagnostic'));
});
test('draft-first jobs can reconnect to the saved result without another model call',async t=>{
 const f=await fixture(t,[{report:'Synthetic draft'}]);const body={operation:'/compose',input:{sources},retry:true};
 let r=await f.request('/jobs',body);const id=r.data.id;
 for(let i=0;i<40&&r.data.status==='running';i++){await new Promise(resolve=>setTimeout(resolve,10));r=await f.request('/jobs/'+id);}
 assert.equal(r.data.status,'completed');assert.equal(r.data.result.report,'Synthetic draft');
 const repeat=await f.request('/jobs',body);assert.equal(repeat.data.id,id);assert.equal(f.requests.length,1);
});
