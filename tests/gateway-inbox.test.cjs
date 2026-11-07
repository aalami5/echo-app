const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {createNotificationInbox,savePendingNotifications}=require('../src/services/notificationInbox.ts');
const {gatewayTimeline}=require('../src/services/gatewayTimeline.ts');
const message=(id,content='Full morning brief',timestamp='2026-11-07T16:30:00Z')=>({id,role:'assistant',content,timestamp});
const memory=()=>{const values=new Map();return {values,getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v);}}};
test('full notification survives restart and overlapping writes without touching paused history',async()=>{
 const store=memory(),inbox=createNotificationInbox(store);await Promise.all([inbox.put(message('one')),inbox.put(message('two'))]);
 const reopened=createNotificationInbox(store);assert.equal((await reopened.page()).messages.length,2);
 assert.equal((await reopened.get('one')).content,'Full morning brief');assert.ok([...store.values.keys()].every(k=>k.startsWith('echo-assistant-tail-notification-v110-')));
 await reopened.put(message('one','Updated full body'));assert.equal((await reopened.page()).messages.length,2);
});
test('failed body or index persistence never acknowledges that notification',async()=>{
 for(const suffix of ['bad','index']){
 const store=memory(),write=store.setItem;store.setItem=async(k,v)=>{if(k.endsWith(suffix))throw Error('disk full');await write(k,v);};
 const inbox=createNotificationInbox(store),acks=[];
 const result=await savePendingNotifications([message('bad')],row=>inbox.put(row),async ids=>acks.push(...ids));
 assert.deepEqual(acks,[]);assert.deepEqual(result.failed,['bad']);
 }
});
test('queue sync acknowledges only saved messages, and retries deduplicate after an uncertain ack',async()=>{
 const store=memory(),inbox=createNotificationInbox(store),acks=[];
 const rows=[message('ok'),message('bad','x'.repeat(65001))];
 await savePendingNotifications(rows,row=>inbox.put(row),async ids=>acks.push(...ids));assert.deepEqual(acks,['ok']);
 await assert.rejects(savePendingNotifications([message('ok')],row=>inbox.put(row),async()=>{throw Error('ack timeout');}));
 await savePendingNotifications([message('ok')],row=>inbox.put(row),async()=>{});assert.equal((await inbox.page()).messages.length,1);
});
test('bounded page preserves full large bodies and can continue without skipping rows',async()=>{
 const store=memory(),inbox=createNotificationInbox(store);
 for(let i=0;i<5;i++)await inbox.put(message('n'+i,'x'.repeat(60000),`2026-11-07T16:3${i}:00Z`));
 const a=await inbox.page(),b=await inbox.page(a.nextOffset),c=await inbox.page(b.nextOffset);
 assert.equal(a.messages.length,2);assert.equal(a.hasMore,true);assert.equal(b.messages.length,2);assert.equal(c.messages.length,1);assert.equal(c.hasMore,false);
 assert.ok([...a.messages,...b.messages,...c.messages].every(row=>row.content.length===60000));
});
test('corrupt index is preserved and cannot authorize destructive queue acknowledgement',async()=>{
 const store=memory();store.values.set('echo-assistant-tail-notification-v110-index','not json');
 const inbox=createNotificationInbox(store);await assert.rejects(inbox.put(message('one')));assert.equal(store.values.size,1);
});
test('notification remains in default chronological timeline despite 100 busy chat turns',()=>{
 const history=Array.from({length:100},(_,i)=>message('chat'+i,'x'.repeat(2000),`2026-11-07T18:${String(i%60).padStart(2,'0')}:00Z`));
 const brief=message('morning','Complete saved brief');const timeline=gatewayTimeline(history,[brief,brief]);
 assert.equal(timeline.filter(row=>row.id==='morning').length,1);assert.equal(timeline[0].id,'morning');assert.ok(timeline.reduce((n,row)=>n+row.content.length,0)<=192000);
});
