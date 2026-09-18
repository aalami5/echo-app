const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');const os = require('os');const path = require('path');const {spawn}=require('child_process');const net=require('net');
test('authenticated API persists receipt, deduplicates old/new clients, report sync cannot erase it', async (t) => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'echo-email-api-'));const bin=path.join(dir,'bin');fs.mkdirSync(bin);
 const calls=path.join(dir,'calls');
 // Fake gog: no network, no real Gmail invocation; the production endpoint is exercised unchanged.
 fs.writeFileSync(path.join(bin,'gog'),`#!${process.execPath}\nconst fs=require('fs');process.stdin.resume();process.stdin.on('end',()=>{fs.appendFileSync(${JSON.stringify(calls)},'send\\n');console.log(JSON.stringify({messageId:'synthetic-'+Date.now()}));});`,{mode:0o700});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const env={...process.env,PORT:String(port),DATA_DIR:dir,AUTH_TOKEN:'test-token',OPENCLAW_GATEWAY_TOKEN:'test-token',OPERATIVE_RVU_API_TOKEN:'',PATH:bin+path.delimiter+process.env.PATH};
 let child;
 const start=async()=>{
  child=spawn(process.execPath,['server/index.js'],{env,stdio:'ignore'});
  for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}
  throw Error('server did not start');
 };
 const stop=async()=>{if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});};
 t.after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true});});await start();
 const request=(url,body,auth='test-token')=>fetch(`http://127.0.0.1:${port}${url}`,{method:body?'POST':'GET',headers:{...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request('/patients/email-receipts',null,'')).status,401);
 assert.equal((await request('/patients/email-receipts',null,'wrong')).status,403);
 const payload={report:'Synthetic report only',reportId:'synthetic-a',requestId:'synthetic-send'};
 let response=await request('/patients/dictations/email',payload);assert.equal(response.status,200);const first=await response.json();assert.ok(first.receipt.sentAt);assert.ok(first.receipt.messageId);
 assert.equal((await request('/dictations/email',payload)).status,200);assert.equal(fs.readFileSync(calls,'utf8').trim().split('\n').length,1);
 await request('/patients/dictations/sync',{dictations:{}});
 await stop();await start();
 response=await request('/patients/email-receipts');assert.equal((await response.json()).receipts[0].id,first.receipt.id);
 assert.equal((await request('/patients/email-receipts/link',{links:[{reportId:'no-match',reportHash:'0'.repeat(64)}]})).status,200);
 const legacy=await (await request('/dictations/email',{report:'Synthetic legacy report'})).json();assert.ok(legacy.success);assert.equal(legacy.receipt.reportId,undefined);
 const hash=legacy.receipt.reportHash;
 const linked=await (await request('/patients/email-receipts/link',{links:[{reportId:'restored',reportHash:hash}]})).json();
 assert.deepEqual(linked.receipts.find(r=>r.id===legacy.receipt.id).linkedReportIds,['restored']);
 assert.equal(fs.readFileSync(calls,'utf8').trim().split('\n').length,2);
});
