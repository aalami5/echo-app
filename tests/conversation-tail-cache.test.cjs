const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {createConversationTailCache,MAX_TAIL_CHARS}=require('../src/services/conversationTailCache.ts');
const message=(content='Saved message')=>[{id:'m1',role:'assistant',content}];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const values=new Map(),writes=[];
 const storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>{writes.push({k,v});values.set(k,v);}};
 return {values,writes,storage,cache:createConversationTailCache(storage)};
}

test('100 unchanged refreshes persist once; a changed message persists and survives restart',async()=>{
 const f=fixture();
 for(let i=0;i<100;i++)await f.cache.save('home',message());
 assert.equal(f.writes.length,1);
 await f.cache.save('home',message('Updated'));
 assert.equal(f.writes.length,2);
 const restarted=createConversationTailCache(f.storage);
 assert.deepEqual(await restarted.read('home'),message('Updated'));
 await restarted.save('home',message('Updated'));
 assert.equal(f.writes.length,2);
});

test('slow writes coalesce latest pending snapshot and never finish out of order',async()=>{
 const f=fixture(),gate=deferred();let active=0,maxActive=0;
 f.storage.setItem=async(k,v)=>{active++;maxActive=Math.max(maxActive,active);if(!f.writes.length){f.writes.push({k,v});await gate.promise;}else f.writes.push({k,v});f.values.set(k,v);active--;};
 const first=f.cache.save('home',message('First'));
 const middle=f.cache.save('home',message('Middle'));
 const last=f.cache.save('home',message('Last'));
 gate.resolve();await Promise.all([first,middle,last]);
 assert.equal(maxActive,1);assert.equal(f.writes.length,2);
 assert.deepEqual(JSON.parse(f.values.get('echo-assistant-tail-home')),message('Last'));
});

test('failed writes do not mark a value persisted; next save retries',async()=>{
 const f=fixture();let attempts=0;
 f.storage.setItem=async(k,v)=>{if(++attempts===1)throw Error('disk unavailable');f.values.set(k,v);};
 await assert.rejects(f.cache.save('home',message()),/disk unavailable/);
 assert.equal(f.values.size,0);
 await f.cache.save('home',message());
 assert.equal(attempts,2);assert.deepEqual(await f.cache.read('home'),message());
});

test('a newer snapshot survives an earlier write failure and is retried, not replaced by older data',async()=>{
 const f=fixture(),gate=deferred();let fail=true;
 f.storage.setItem=async(k,v)=>{if(fail){await gate.promise;throw Error('failed');}f.values.set(k,v);};
 const first=f.cache.save('home',message('First'));
 const last=f.cache.save('home',message('Last'));
 const a=assert.rejects(first,/failed/),b=assert.rejects(last,/failed/);
 gate.resolve();await Promise.all([a,b]);fail=false;
 await f.cache.save('home',message('Last'));
 assert.deepEqual(await f.cache.read('home'),message('Last'));
});

test('conversation caches are isolated; drafts, source history and receipts are never touched',async()=>{
 const f=fixture();
 f.values.set('echo-assistant-outbox-v1','uncertain-send-receipt');
 f.values.set('echo-assistant-draft-home','unsent draft');
 await f.cache.save('home',message('Home'));
 await f.cache.save('project',message('Project'));
 assert.deepEqual(await f.cache.read('home'),message('Home'));
 assert.deepEqual(await f.cache.read('project'),message('Project'));
 assert.equal(f.values.get('echo-assistant-outbox-v1'),'uncertain-send-receipt');
 assert.equal(f.values.get('echo-assistant-draft-home'),'unsent draft');
 assert.ok(f.writes.every(w=>w.k.startsWith('echo-assistant-tail-')));
});

test('oversized data is not serialized or parsed, and existing cache is left intact',async()=>{
 const f=fixture();await f.cache.save('home',message());
 const before=f.values.get('echo-assistant-tail-home');
 const oversized=message('X'.repeat(MAX_TAIL_CHARS+1));
 await f.cache.save('home',oversized);
 assert.equal(f.values.get('echo-assistant-tail-home'),before);
 assert.equal(oversized[0].content.length,MAX_TAIL_CHARS+1);
 f.values.set('echo-assistant-tail-legacy','X'.repeat(MAX_TAIL_CHARS+1));
 assert.deepEqual(await f.cache.read('legacy'),[]);
 assert.equal(f.values.get('echo-assistant-tail-legacy').length,MAX_TAIL_CHARS+1);
});

test('encoded escaping and many records also obey cap; invalid cache is nonfatal',async()=>{
 const f=fixture();
 await f.cache.save('home',message('\u0000'.repeat(MAX_TAIL_CHARS/2)));
 await f.cache.save('home',Array.from({length:101},()=>message()[0]));
 assert.equal(f.writes.length,0);
 for(const value of ['{bad','{}','[null]','[{"id":1,"role":"user","content":"x"}]']){
  f.values.set('echo-assistant-tail-home',value);
  assert.deepEqual(await f.cache.read('home'),[]);
  assert.equal(f.values.get('echo-assistant-tail-home'),value);
 }
 await f.cache.save('home',message('Recovered from authoritative history'));
 assert.deepEqual(await f.cache.read('home'),message('Recovered from authoritative history'));
});

test('a late stale read cannot poison the successful-write comparison',async()=>{
 const f=fixture(),gate=deferred();
 f.storage.getItem=async()=>{await gate.promise;return JSON.stringify(message('Old'));};
 const read=f.cache.read('home');
 await f.cache.save('home',message('New'));
 gate.resolve();await read;
 await f.cache.save('home',message('New'));
 assert.equal(f.writes.length,1);
});

test('bounded tracking never drops a pending writer and recovers for new conversations',async()=>{
 const f=fixture(),gate=deferred();
 f.storage.setItem=async(k,v)=>{await gate.promise;f.writes.push({k,v});f.values.set(k,v);};
 const pending=Array.from({length:8},(_,i)=>f.cache.save(String(i),message(String(i))));
 await f.cache.save('ninth',message('New'));
 gate.resolve();await Promise.all(pending);
 assert.equal(f.writes.length,8);
 await f.cache.save('ninth',message('New'));
 assert.equal(f.writes.length,9);
 for(let i=0;i<8;i++)assert.deepEqual(JSON.parse(f.values.get(`echo-assistant-tail-${i}`)),message(String(i)));
});
