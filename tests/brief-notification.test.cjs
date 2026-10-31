const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript'), Module=require('module');
let responseHandler; const load=Module._load;
Module._load=function(id,...args){
 if(id==='expo-notifications') return {setNotificationHandler(){},addNotificationResponseReceivedListener(fn){responseHandler=fn;return {remove(){}}}};
 if(id==='expo-device')return {};
 if(id==='expo-constants')return {__esModule:true,default:{}};
 if(id==='react-native')return {Platform:{OS:'ios'}};
 if(id==='@react-native-async-storage/async-storage')return {};
 if(id==='../lib/supabase')return {supabase:{}};
 return load.call(this,id,...args);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {linkedBriefId,briefMessageText}=require('../src/services/briefNotification.ts');
const {setupNotificationResponseHandler}=require('../src/services/notifications.ts');
Module._load=load;
test('linked push opens its exact Home message, not the legacy text callback',()=>{
 const called=[];
 setupNotificationResponseHandler(()=>called.push('meeting'),()=>called.push('legacy'),()=>called.push('brief'),id=>called.push(id));
 responseHandler({notification:{request:{content:{data:{type:'message',conversationId:'home',chatMessageId:'native-id-123',messageContent:'Untrusted preview'}}}}});
 assert.deepEqual(called,['native-id-123']);
});
test('legacy notifications retain their existing route',()=>{
 let legacy=0;
 setupNotificationResponseHandler(()=>{},()=>legacy++,()=>{},()=>assert.fail('not linked'));
 responseHandler({notification:{request:{content:{data:{type:'message',messageId:'legacy'}}}}});assert.equal(legacy,1);
});
test('malformed or other-conversation links cannot select arbitrary session or URL',()=>{
 for(const data of [null,{}, {conversationId:'noharm',chatMessageId:'abc'}, {conversationId:'home',chatMessageId:'../private'}, {conversationId:'home',chatMessageId:'https://bad.example'}, {conversationId:'home',chatMessageId:['abc']}]) assert.equal(linkedBriefId(data),null);
});
test('renders authoritative assistant text; unavailable, user and oversized payloads fail closed',()=>{
 assert.equal(briefMessageText({ok:true,message:{role:'assistant',content:[{type:'text',text:'Saved brief'},{type:'tool',text:'hidden'}]}}),'Saved brief');
 for(const r of [{available:false},{message:{role:'user',content:'not a brief'}},{message:{role:'assistant',content:'x'.repeat(65001)}}]) assert.throws(()=>briefMessageText(r));
});
