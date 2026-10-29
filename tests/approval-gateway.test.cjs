const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),Module=require('module');
let socket, granted=true, signed=[];const load=Module._load;
Module._load=function(id,...args){if(id==='react-native')return {Platform:{OS:'ios'}};if(id==='./approvalIdentity')return {loadApprovalIdentity:async()=>({id:'test-device',publicKey:'test-public',sign:async s=>{signed.push(s);return 'synthetic-signature'}})};return load.call(this,id,...args)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {ApprovalGateway}=require('../src/services/approvalGateway.ts');Module._load=load;
class WS {static OPEN=1;readyState=1;sent=[];constructor(url){this.url=url;socket=this;queueMicrotask(()=>this.emit({event:'connect.challenge',payload:{nonce:'nonce1',ts:1000}}));}emit(frame){this.onmessage?.({data:JSON.stringify(frame)})}send(raw){const f=JSON.parse(raw);this.sent.push(f);if(f.id==='hello')queueMicrotask(()=>this.emit({type:'res',id:'hello',ok:true,payload:{auth:{scopes:granted?f.params.scopes:['operator.read']},features:{methods:['approval.get','approval.resolve','exec.approval.list','cron.list']}}}));}close(){this.readyState=3;this.onclose?.()}}global.WebSocket=WS;
test('signed handshake requests separate approval authority, not silent admin',async()=>{
 const gateway=new ApprovalGateway('https://example.com','synthetic-token','owner');await gateway.connect();const hello=socket.sent[0];assert.equal(hello.params.device.nonce,'nonce1');assert.deepEqual(hello.params.scopes,['operator.read','operator.approvals']);assert.match(signed.at(-1),/^v3\|test-device\|openclaw-ios\|ui\|operator\|/);assert.equal(gateway.ready,true);gateway.close();
});
test('server refusing approval scope fails closed',async()=>{granted=false;const g=new ApprovalGateway('https://example.com','x','owner');await assert.rejects(g.connect(),/authority/);assert.equal(g.ready,false);g.close();granted=true;});
test('insecure remote URL and missing owner rejected before connection',async()=>{
 await assert.rejects(new ApprovalGateway('http://remote.example','x','owner').connect(),/HTTPS/);await assert.rejects(new ApprovalGateway('ftp://localhost','x','owner').connect(),/HTTP/);await assert.rejects(new ApprovalGateway('https://example.com','x','').connect(),/Sign in/);
});
test('disconnect rejects pending request and reconnect does not replay it',async()=>{
 const g=new ApprovalGateway('https://example.com','x','owner');await g.connect();const promise=g.request('approval.resolve',{id:'r1',kind:'exec',decision:'allow-once'});const before=socket;g.close();await assert.rejects(promise,/closed/);assert.equal(before.sent.filter(x=>x.method==='approval.resolve').length,1);await g.connect();assert.equal(socket.sent.filter(x=>x.method==='approval.resolve').length,0);g.close();
});
test('unsupported RPC cannot be submitted',async()=>{const g=new ApprovalGateway('https://example.com','x','owner');await g.connect();await assert.rejects(g.request('invented.method',{}),/does not support/);assert.equal(socket.sent.length,1);g.close()});
