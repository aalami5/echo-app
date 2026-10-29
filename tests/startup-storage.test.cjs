const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {createPreviewStorage}=require('../src/services/previewStorage.ts');
const {installStartupStorageProbe}=require('../src/services/startupStorageProbe');
test('oversized preview is not read or overwritten, including a racing save; other records remain untouched',async()=>{
 const calls=[];const storage={getItem:async k=>{calls.push(['read',k]);return 'original'},setItem:async(k,v)=>calls.push(['write',k,v])};
 const preview=createPreviewStorage(storage,async()=>false);
 await Promise.all([preview.getItem('echo-assistant-tail-home'),preview.setItem('echo-assistant-tail-home','[]')]);
 assert.deepEqual(calls,[]);
 await assert.rejects(preview.getItem('echo-assistant-outbox-v1'),/Not a preview/);
 await assert.rejects(preview.setItem('patient-dictations-store','[]'),/Not a preview/);
 assert.deepEqual(calls,[]);
});
test('metadata failure skips optional preview without changing stored data; bounded preview reads and writes work',async()=>{
 const map=new Map([['echo-assistant-tail-home','saved']]);let reads=0;
 const storage={getItem:async k=>{reads++;return map.get(k)},setItem:async(k,v)=>map.set(k,v)};
 const rejected=createPreviewStorage(storage,async()=>{throw Error('unavailable')});
 assert.equal(await rejected.getItem('echo-assistant-tail-home'),null);await rejected.setItem('echo-assistant-tail-home','replacement');assert.equal(reads,0);assert.equal(map.get('echo-assistant-tail-home'),'saved');
 const allowed=createPreviewStorage(storage,async()=>true);assert.equal(await allowed.getItem('echo-assistant-tail-home'),'saved');await allowed.setItem('echo-assistant-tail-home','updated');assert.equal(map.get('echo-assistant-tail-home'),'updated');
});
test('probe preserves callbacks/results/errors, never exports arbitrary keys or values, and bounds events',async()=>{
 const events=[];const storage={getItem:(k,cb)=>{const error=k==='failure'?new Error('secret error'):null;cb?.(error,'private text');return error?Promise.reject(error):Promise.resolve('private text')}};
 installStartupStorageProbe(storage,{storageRead:(...args)=>events.push(args)});installStartupStorageProbe(storage,{storageRead:()=>assert.fail('double wrapping')});
 let callback;assert.equal(await storage.getItem('private-patient-id',(e,v)=>callback=v),'private text');assert.equal(callback,'private text');await assert.rejects(storage.getItem('failure'),/secret error/);
 for(let i=0;i<100;i++)await storage.getItem('echo-assistant-tail-private-id');
 assert.equal(events.length,80);assert.doesNotMatch(JSON.stringify(events),/private|secret|failure/);assert.deepEqual(events[0],['other','requested',0]);assert.deepEqual(events[1],['other','completed',12]);
});
