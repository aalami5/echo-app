const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {loadUpdatePage}=require('../src/services/updateHistory.ts');
const brief={id:'brief',role:'assistant',content:'[morning-brief-2026-11-07]\nA saved brief'};
test('finds a saved brief beyond two pages of ordinary messages, before applying the text budget',async()=>{
 const offsets=[];const result=await loadUpdatePage(async offset=>{offsets.push(offset);return {messages:offset===204?[brief,...Array.from({length:99},(_,i)=>({id:String(i),role:'assistant',content:'x'.repeat(20000)}))]:[],nextOffset:offset+102,hasMore:true}},x=>x);
 assert.deepEqual(offsets,[0,102,204]);assert.deepEqual(result.messages,[brief]);assert.equal(result.nextOffset,306);assert.equal(result.hasMore,true);
});
test('empty scan is bounded and allows explicit continuation without keeping ordinary history',async()=>{
 let reads=0;const result=await loadUpdatePage(async offset=>{reads++;return {messages:[],nextOffset:offset+100,hasMore:true}},x=>x);
 assert.equal(reads,5);assert.deepEqual(result.messages,[]);assert.equal(result.nextOffset,500);assert.equal(result.hasMore,true);
 const next=await loadUpdatePage(async offset=>{assert.equal(offset,500);return {messages:[brief],hasMore:false}},x=>x,result.nextOffset);assert.deepEqual(next.messages,[brief]);
});
test('cancellation discards a late result and broken pagination cannot loop',async()=>{
 let current=true;assert.equal(await loadUpdatePage(async()=>{current=false;return {messages:[brief]}},x=>x,0,()=>current),null);
 let reads=0;const result=await loadUpdatePage(async()=>{reads++;return {messages:[],nextOffset:0,hasMore:true}},x=>x);assert.equal(reads,1);assert.equal(result.hasMore,false);
});
