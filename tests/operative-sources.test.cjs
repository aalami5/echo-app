const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),fs=require('node:fs');
let calls=[],responses=[],refreshes=0,token='old';
const original=Module._load;Module._load=function(id,...args){
 if(id.endsWith('/gatewayBootstrap'))return {ensureGatewayConfig:async()=>true,refreshGatewayConfig:async()=>{token='new';refreshes++;return true;}};
 if(id.endsWith('/settingsStore'))return {useSettingsStore:{getState:()=>({gatewayUrl:'https://synthetic.example',gatewayToken:token})}};
 return original.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {caseSources,sourceFingerprint,extractCaseImages,operativeRequest}=require('../src/services/operativeDrafting.ts');
global.fetch=async(url,options)=>{calls.push({url,options});const next=responses.shift();return {ok:next.status===200,status:next.status,json:async()=>next.body};};
test('typed, voice and OCR facts share source authority; historical copy IDs excluded even on legacy reports',()=>{
 const parts=[{id:'1-header',type:'text',content:'Header'},{id:'2',type:'voice',content:'This is Dr. Aalami, left AV fistula with no complications.'},{id:'3-copy',type:'text',content:'Old report'},{id:'4',type:'image',content:'Brief note',ocrText:'5 x 100 mm',ocrWarnings:['unclear unit']},{id:'5',type:'text',sourceKind:'correction',content:'Actually 6 x 100 mm'}];
 const s=caseSources(parts);assert.equal(s[0].kind,'header');assert.equal(s[1].kind,'voice');assert.equal(s[2].kind,'historical');assert.equal(s[3].kind,'ocr');assert.ok(s[3].text.includes('5 x 100 mm'));assert.equal(s[4].kind,'correction');
 assert.notEqual(sourceFingerprint(parts),sourceFingerprint(parts.map(p=>p.id==='4'?{...p,ocrText:'changed'}:p)));
});
test('OCR result is durably handed off before analysis; later regeneration reuses exact text without re-reading screenshot',async()=>{
 calls=[];responses=[{status:200,body:{text:'Left SFA, 7 Fr sheath.',warnings:[]}}];let saved;
 const parts=await extractCaseImages([{id:'1',type:'image',content:'brief',imageBase64:'AAAA',imageMimeType:'image/jpeg'}],p=>saved=p);
 assert.equal(saved.ocrText,'Left SFA, 7 Fr sheath.');assert.equal(calls.length,1);
 const replay=await extractCaseImages(parts);assert.equal(replay[0].ocrText,saved.ocrText);assert.equal(calls.length,1);
 await assert.rejects(extractCaseImages([{id:'2',type:'image',content:'legacy unavailable screenshot'}]),/Reattach/);
});
test('new clinical endpoint uses server credential path, refreshes app auth once, does not fall back on unavailable route',async()=>{
 calls=[];refreshes=0;responses=[{status:401,body:{}},{status:200,body:{catalog:[]}}];await operativeRequest('/catalog');assert.equal(refreshes,1);assert.equal(calls[1].options.headers.Authorization,'Bearer new');
 responses=[{status:503,body:{error:'Service unavailable'}}];await assert.rejects(operativeRequest('/draft',{sessionId:'synthetic'}),/Service unavailable/);assert.equal(refreshes,1);
});
