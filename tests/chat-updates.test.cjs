const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {boundedMessages,mergeRecent,parseUpdate,decodeReadIds}=require('../src/services/chatUpdates.ts');
const row=(id,content='body')=>({id,role:'assistant',content});
test('live history never grows without bound across repeated polls',()=>{
 let messages=[];for(let i=0;i<1000;i++)messages=mergeRecent(messages,[row('message-'+i,'x'.repeat(2000))]);
 assert.ok(messages.length<=100);assert.ok(messages.reduce((n,m)=>n+m.content.length+m.id.length,0)<=65536);assert.equal(messages.at(-1).id,'message-999');
 assert.equal(mergeRecent(messages,[messages.at(-1)]).length,messages.length);
});
test('oversized message does not mutate input or allocate an unbounded live window',()=>{const r=[row('big','x'.repeat(100000))];assert.deepEqual(boundedMessages(r),[]);assert.equal(r[0].content.length,100000);});
test('cards parse canonical bounded metadata and keep full text and links',()=>{
 const meta={version:1,title:'Meeting',summary:'Starts soon',priority:'urgent',kind:'reminder'};
 const c=parseUpdate(row('id',`[update-meeting-2026-11-02]\n\n<!-- echo-update:${JSON.stringify(meta)} -->\n\nFull https://example.org`));
 assert.equal(c.title,'Meeting');assert.equal(c.body,'Full https://example.org');
 assert.equal(parseUpdate({...row('id','text'),role:'user'}),null);
 assert.equal(parseUpdate(row('id','<!-- echo-update:{bad} -->\nbody')),null);
});
test('delivered failure notice is explicitly attention, not successful brief',()=>{
 const c=parseUpdate(row('id','[daily-email-review-2026-11-02]\n\nAUTOMATION_FAILED\nGmail unavailable'));
 assert.equal(c.kind,'attention');assert.match(c.title,/needs attention/);assert.equal(c.body,'Gmail unavailable');
});
test('read markers are bounded and do not accept corrupted storage',()=>{assert.deepEqual(decodeReadIds('{bad'),[]);assert.deepEqual(decodeReadIds('x'.repeat(32001)),[]);assert.equal(decodeReadIds(JSON.stringify(Array.from({length:500},(_,i)=>String(i)))).length,200);});
