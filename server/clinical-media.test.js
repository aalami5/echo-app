const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {installClinicalMedia}=require('./clinical-media');
async function setup(t, fetchImpl, options={}) {
  const app=express();installClinicalMedia(app,{apiKey:'server-only-secret',authToken:'synthetic-app-token',fetchImpl,...options});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}/patients/media`;
  return (path,body,auth=true)=>fetch(base+path,{method:'POST',headers:{...(auth?{Authorization:'Bearer synthetic-app-token'}:{}),...(body instanceof FormData ? {} : {'Content-Type':'application/json'})},body:body instanceof FormData ? body : JSON.stringify(body)});
}
const photo={mimeType:'image/jpeg',imageBase64:Buffer.from([255,216,255,224,0,0]).toString('base64')};
test('rejects unauthenticated and missing server configuration without forwarding',async t=>{
 const req=await setup(t,()=>{throw Error('must not call');});assert.equal((await req('/scan',photo,false)).status,401);
 const missing=await setup(t,()=>{throw Error('must not call');},{apiKey:''});assert.equal((await missing('/scan',photo)).status,503);
 const authMissing=await setup(t,()=>{throw Error('must not call');},{authToken:''});assert.equal((await authMissing('/scan',photo)).status,401);
});
test('scan preserves leading zeros, constrains output and uses server credential',async t=>{
 const req=await setup(t,async (url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer server-only-secret');
  const body=JSON.parse(options.body);assert.equal(body.response_format.type,'json_object');assert.match(body.messages[0].content,/including leading zeros/);
  return Response.json({choices:[{message:{content:JSON.stringify({name:'SYNTHETIC, TEST',mrn:'00012345',dob:null,unexpected:'ignore'})}}]});
 });
 const res=await req('/scan',photo);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');const body=await res.json();assert.equal(body.mrn,'00012345');assert.equal(body.dob,null);assert.equal(body.unexpected,undefined);
});
test('invalid/no-readable image and malformed JSON produce safe useful errors',async t=>{
 let calls=0;const req=await setup(t,async()=>{calls++;return Response.json({choices:[{message:{content:'{}'}}]});});
 assert.equal((await req('/scan',{...photo,imageBase64:'not-image'})).status,400);assert.equal(calls,0);
 assert.equal((await req('/scan',photo)).status,422);
 const invalid=await setup(t,async()=>Response.json({choices:[{message:{content:'invalid'}}]}));assert.equal((await invalid('/scan',photo)).status,502);
});
test('provider 401 is not app 401 and does not expose upstream body',async t=>{
 const req=await setup(t,async()=>new Response('secret-provider-key and private content',{status:401}));
 const res=await req('/scan',photo);assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/secret-provider-key|private content/);
});
test('multipart audio forwards bytes using server-selected model, returns transcript',async t=>{
 const req=await setup(t,async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');assert.equal(options.body.get('model'),'whisper-1');assert.equal(options.body.get('file').size,5);assert.equal(options.body.get('language'),'en');
  assert.equal(options.headers.Authorization,'Bearer server-only-secret');return Response.json({text:' Synthetic calf pain. '});
 });
 const body=new FormData();body.append('file',new Blob(['audio'],{type:'audio/m4a'}),'test.m4a');body.append('model','untrusted-model');body.append('language','en');
 const res=await req('/transcribe',body);assert.equal(res.status,200);assert.equal((await res.json()).text,'Synthetic calf pain.');
});
test('empty or invalid audio rejected without provider use; rate limits remain actionable',async t=>{
 const req=await setup(t,()=>{throw Error('must not call');});assert.equal((await req('/transcribe',{})).status,400);
 const form=new FormData();form.append('file',new Blob([]),'test.m4a');assert.equal((await req('/transcribe',form)).status,400);
 const limit=await setup(t,async()=>new Response('upstream',{status:429}));assert.equal((await limit('/scan',photo)).status,429);
});
