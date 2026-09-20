const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const Module=require('module');const fs=require('fs');
let settings={gatewayUrl:'https://echo.test',gatewayToken:'old'};let refreshed=0;
const load=Module._load;Module._load=function(id,...args){
 if(id.endsWith('/settingsStore'))return {useSettingsStore:{getState:()=>settings}};
 if(id.endsWith('/gatewayBootstrap'))return {ensureGatewayConfig:async()=>true,refreshGatewayConfig:async()=>{refreshed++;settings.gatewayToken='new';return {token:'new'};}};
 return load.call(this,id,...args);
};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {clinicalMediaRequest}=require('../src/services/clinicalMedia.ts');
const {transcribeAudio}=require('../src/services/whisper.ts');
test('stale app auth refreshes exactly once and retries with a new multipart body',async()=>{
 settings.gatewayToken='old';refreshed=0;const bodies=[];const tokens=[];
 global.fetch=async(url,options)=>{assert.equal(url,'https://echo.test/patients/media/scan');bodies.push(options.body);tokens.push(options.headers.Authorization);return tokens.length===1?new Response('',{status:401}):Response.json({mrn:'000123'});};
 let count=0;const result=await clinicalMediaRequest('/scan',()=>String(++count),true);assert.equal(result.mrn,'000123');assert.equal(refreshed,1);assert.deepEqual(tokens,['Bearer old','Bearer new']);assert.deepEqual(bodies,['1','2']);
});
test('provider failure does not trigger app login loop; repeated app 401 stops',async()=>{
 refreshed=0;global.fetch=async()=>Response.json({error:'Temporarily unavailable'},{status:503});await assert.rejects(()=>clinicalMediaRequest('/scan',()=>''),/Temporarily/);assert.equal(refreshed,0);
 global.fetch=async()=>new Response('',{status:401});await assert.rejects(()=>clinicalMediaRequest('/scan',()=>''),/reconnect/);assert.equal(refreshed,1);
});
test('Whisper works with missing or invalid local provider key and never sends that key',async()=>{
 global.FormData=class {fields=[];append(...args){this.fields.push(args);}};
 global.fetch=async(url,options)=>{assert.equal(url,'https://echo.test/patients/media/transcribe');assert.equal(options.headers.Authorization,'Bearer new');assert.equal(options.headers['Content-Type'],undefined);assert.equal(options.body.fields.find(f=>f[0]==='file')[1].uri,'file:///recording.m4a');return Response.json({text:'Calf pain with walking.'});};
 assert.equal((await transcribeAudio('file:///recording.m4a')).text,'Calf pain with walking.');
 assert.equal((await transcribeAudio('file:///recording.m4a',{apiKey:'revoked-do-not-use'})).text,'Calf pain with walking.');
});
