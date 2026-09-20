const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const net=require('node:net');const {spawn}=require('node:child_process');
test('authenticated legacy sync is additive, drafts restore, ciphertext and restart retain records',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo-clinical-api-'));
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 let child;const env={...process.env,PORT:String(port),DATA_DIR:dir,CLINICAL_KEY_FILE:path.join(dir,'key'),AUTH_TOKEN:'synthetic',OPENCLAW_GATEWAY_TOKEN:'synthetic',OPERATIVE_RVU_API_TOKEN:''};
 const start=async()=>{child=spawn(process.execPath,['server/index.js'],{env,stdio:'ignore'});for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('startup failed');};
 const stop=async()=>{if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});};
 t.after(stop);await start();
 const req=(url,data,token='synthetic')=>fetch(`http://127.0.0.1:${port}${url}`,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const state={patients:{p:{id:'p',name:'Synthetic Patient',callDayId:'d'}},callDays:{d:{id:'d',date:'2026-09-19',patientIds:['p']}},callDayOrder:['d']};
 assert.equal((await req('/patients/sync',state,'wrong')).status,403);
 assert.equal((await req('/patients/sync',state)).status,200);
 assert.equal((await req('/sync',{patients:{},callDays:{},callDayOrder:[]})).status,200);
 let r=await req('/patients/list');assert.equal(r.headers.get('cache-control'),'no-store');assert.ok((await r.json()).patients.p);
 const draft={id:'report',patientId:'p',status:'draft',transcriptParts:[],generatedReport:'Synthetic report',updatedAt:'2026-09-19'};
 assert.equal((await req('/patients/dictations/sync',{dictations:{report:draft}})).status,200);
 await req('/patients/dictations/sync',{dictations:{}});
 await stop();await start();
 assert.equal((await (await req('/patients/dictations/list')).json()).dictations.report.status,'draft');
 assert.ok((await (await req('/patients/list')).json()).patients.p);
 for(const file of ['patients.json','dictations.json']){const text=fs.readFileSync(path.join(dir,file),'utf8');assert.match(text,/echo-clinical-aes256gcm-v1/);assert.ok(!text.includes('Synthetic'));}
});
