// Opt-in synthetic-only provider evaluation. No production patient reads/writes.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),express=require('../server/node_modules/express');
const {installOperativeDrafting}=require('../server/operative-drafting');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo-operative-live-'));
const app=express();app.use(express.json({limit:'10mb'}));installOperativeDrafting(app,{apiKey:process.env.OPENAI_API_KEY,authToken:'synthetic-only',dataDir:dir});
const cases=[
 {name:'dialysis',note:'Synthetic case. Left radiocephalic AV fistula creation for ESRD requiring dialysis access. Surgeon Oliver Aalami MD. No assistant. Local anesthesia with sedation. Cephalic vein 3 mm; radial artery 2.5 mm. End-to-side anastomosis with running 6-0 Prolene. Good thrill and palpable radial pulse at completion. EBL 10 mL. No specimens, drains, Foley or complications. Stable to recovery.',want:/fistula/i,forbid:/heparin|ultrasound|5000/i},
 {name:'endovascular-source-override',note:'Synthetic case. Left SFA stenosis causing lifestyle-limiting claudication. Right common femoral access. Ultrasound guidance used. 7 Fr sheath, not the usual 6 Fr. Angioplasty left SFA with 5 x 100 mm balloon over 0.018 wire. No stent. Completion angiogram: less than 20% residual stenosis, two-vessel runoff. Manual compression. MAC. EBL 15 mL. No complications. Surgeon Oliver Aalami MD.',steps:[{procedure:'Lower Extremity Angioplasty/Stenting',text:'A 6 Fr sheath was placed and manual compression used for hemostasis.'}],want:/angioplasty/i,forbid:/6\s*(?:Fr|French)|(?:A|The) stent was (?:placed|deployed)/i},
 {name:'aortic',note:'Synthetic case. EVAR for asymptomatic 5.8 cm infrarenal AAA. Bilateral femoral percutaneous access. Gore Excluder main body 28 x 14 x 120 mm and left iliac limb 16 x 140 mm. General anesthesia. No endoleak on completion angiogram, renal arteries patent. Bilateral Perclose closure. EBL 75 mL, contrast 90 mL, fluoroscopy 12 minutes. No complications. Surgeon Oliver Aalami MD.',want:/EVAR|Endovascular.*(?:Aneurysm|Aortic)/i,forbid:/8000|18 French|left renal.*lowest/i},
 {name:'carotid',note:'Synthetic case. Left carotid endarterectomy for symptomatic 80% ICA stenosis. General anesthesia. Patch closure with bovine pericardium. No shunt used. Completion Doppler good flow. EBL 50 mL. No complications. Neurologically intact on waking. Surgeon Oliver Aalami MD.',want:/endarterectomy/i,forbid:/shunt (?:was )?(?:placed|inserted)|protamine/i},
 {name:'venous',note:'Synthetic case. IVC filter retrieval after resolution of contraindication to anticoagulation. Right internal jugular access. Local anesthesia. Snare retrieval with all filter struts intact. Completion venogram without extravasation. EBL 5 mL, no complications. Surgeon Oliver Aalami MD.',want:/filter/i,forbid:/filter (?:was )?(?:placed|deployed)|heparin/i},
 {name:'other-mixed-custom',note:'Synthetic case. Right foot wound excisional debridement through subcutaneous tissue, 4 x 3 cm, plus custom adjunct superficial wound swab for culture. No bone removed. Local anesthesia. Necrotic tissue excised to viable tissue. EBL 2 mL. No complications. Surgeon Oliver Aalami MD.',want:/debridement/i,forbid:/(?:The|Some) bone was (?:removed|excised)|No specimens/i},
 {name:'unknown-negatives',note:'Synthetic case. Left lower extremity angiogram. Indication rest pain. Access via right CFA, 5 Fr sheath. Findings: occluded left SFA with popliteal reconstitution.',want:/angiogram|angioplasty/i,forbid:/no complications|complications[^\n]*none|no foley|assistant[^\n]*none|stable.*recovery/i},
 {name:'contradictory-side',note:'Synthetic case. Procedure heading: right carotid endarterectomy. Body: the left carotid artery was exposed and endarterectomy performed.',want:/endarterectomy/i,mustReview:true},
];
(async()=>{const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 async function request(p,b){const r=await fetch(`http://127.0.0.1:${server.address().port}/patients/operative${p}`,{method:b===undefined?'GET':'POST',headers:{Authorization:'Bearer synthetic-only','Content-Type':'application/json'},body:b===undefined?undefined:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw Error(`${p} ${r.status}: ${j.error}`);return j;}
 async function call(p,b){
  if(!process.env.USE_JOBS)return request(p,b);
  const input={operation:p,input:b,retry:true};const start=Date.now();
  let j=await request('/jobs',input);const initialId=j.id;
  while(j.status==='running'){if(Date.now()-start>110000)throw Error('Job deadline');await new Promise(r=>setTimeout(r,250));j=await request('/jobs/'+j.id);}
  if(j.status!=='completed')throw Error(j.error||'Incomplete job');
  const again=await request('/jobs',input);assert.equal(again.id,initialId);assert.deepEqual(again.result,j.result);
  return j.result;
 }

 let failed=0;const timings=[];
 try{
  // Two at a time: realistic latency without saturating the provider.
  const selected=process.env.CASE_FILTER?cases.filter(c=>c.name.includes(process.env.CASE_FILTER)):cases;
  for(let start=0;start<selected.length;start+=2){await Promise.all(selected.slice(start,start+2).map(async c=>{const begun=Date.now();try{
   const a=await call('/analyze',{caseId:`synthetic-${c.name}`,sources:[{id:'note',kind:'text',text:c.note}],customProcedures:['Custom adjunct superficial wound swab for culture']});
   assert.match(a.procedures.join(' '),c.want);
   const d=await call('/draft',{sessionId:a.id,confirmedSteps:c.steps||[]});
   const narrative=d.report.split('**Open Items:**')[0];
   assert.ok(narrative.length>100 && d.statements.length>=3,'Must return a usable supported narrative');
   if(c.forbid)assert.doesNotMatch(narrative,c.forbid);
   if(c.mustReview)assert.ok(d.review.some(r=>/right|left|laterality|side|conflict/i.test(r)));
   fs.writeFileSync(path.join(dir,c.name+'.output.json'),JSON.stringify({analysis:a,draft:d},null,2),{mode:0o600});
   timings.push(Date.now()-begun);console.log(JSON.stringify({case:c.name,status:'passed',facts:a.facts.length,statements:d.statements.length,reviewItems:d.review.length,seconds:Math.round((Date.now()-begun)/1000)}));
  }catch(e){failed++;console.log(JSON.stringify({case:c.name,status:'FAILED',error:e.message}));}}));}
  if(!process.env.CASE_FILTER && fs.existsSync('/tmp/echo-brief-note-synthetic.png')) {
   try {
    const begun=Date.now();const ocr=await call('/ocr',{imageBase64:fs.readFileSync('/tmp/echo-brief-note-synthetic.png').toString('base64'),mimeType:'image/png'});
    assert.match(ocr.text,/7 Fr/);assert.match(ocr.text,/0\.018/);assert.match(ocr.text,/5 x 100 mm/);assert.match(ocr.text,/no stent/i);
    const a=await call('/analyze',{caseId:'synthetic-ocr',sources:[{id:'screenshot',kind:'ocr',text:ocr.text,warnings:ocr.warnings}]});
    const d=await call('/draft',{sessionId:a.id,confirmedSteps:[]});assert.match(d.report,/7 Fr/);assert.match(d.report,/0\.018/);assert.match(d.report,/no stent/i);assert.ok(d.statements.length>=5);
    console.log(JSON.stringify({case:'screenshot-end-to-end',status:'passed',seconds:(Date.now()-begun)/1000,facts:a.facts.length,statements:d.statements.length,reviewItems:d.review.length}));
   }catch(e){failed++;console.log(JSON.stringify({case:'screenshot-end-to-end',status:'FAILED',error:e.message}));}
  }
 }finally{server.closeAllConnections();server.close();console.log(JSON.stringify({syntheticArtifactDirectory:dir,failed,timingsMs:timings}));process.exitCode=failed?1:0;}
})();
