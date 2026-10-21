import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareStartupMemory, OWNER_DM } from '../gateway/startup-memory.mjs';
async function fixture(t) {
 const workspace = await fs.mkdtemp(path.join(os.tmpdir(),'startup-memory-'));
 await fs.mkdir(path.join(workspace,'data/assistant'),{recursive:true});
 await fs.writeFile(path.join(workspace,'data/assistant/index.json'), JSON.stringify({conversations:{home:{key:'agent:main:echo-app:home'}}}));
 t.after(()=>fs.rm(workspace,{recursive:true,force:true}));return workspace;
}
function fake(calls, overrides={}) { return async (method,p) => {
 calls.push({method,p}); if(overrides[method]) return overrides[method](p);
 if(method==='sessions.list') return {sessions:[{key:OWNER_DM,updatedAt:4},{key:'agent:main:whatsapp:direct:+999',updatedAt:9},{key:'agent:main:whatsapp:group:x',updatedAt:10},{key:'agent:main:patient:123',updatedAt:11}]};
 if(method==='chat.history') return {messages:[{id:'promise',role:'assistant',content:'I will send the proposal.'},{id:'correction',role:'user',content:p.sessionKey===OWNER_DM?'Latest correction: the project codename is AZURE-729. Mail later bounced.':'We screened 230 entries; final summary remains unfinished.'}],sessionInfo:{activeRunIds:[]}};
 if(method==='tasks.list') return {tasks:[]};
 if(method==='artifacts.list') return {artifacts:[{id:'source-1',title:'Screening evidence'}]};
 if(method==='memory.search')return {results:[{path:'memory/2026-10-21.md',startLine:44,snippet:'Screened 230 entries; final summary pending.'},{path:'sessions/foreign.jsonl',snippet:'UNAUTHORIZED'},{path:'memory/2026-10-21.md',snippet:'Patient MRN PRIVATE'}]};
 throw Error(method);
};}
test('first response context includes cross-private correction and unfinished work, without claiming task execution',async t=>{
 const calls=[];const r=await prepareStartupMemory({workspace:await fixture(t),agentId:'main',sessionKey:'agent:main:echo-app:home',call:fake(calls)});
 assert.match(r.instructions,/AZURE-729/);assert.match(r.instructions,/230/);assert.match(r.instructions,/empty list does NOT mean no prior work/);assert.match(r.instructions,/promises are not evidence/);assert.match(r.instructions,/source-1/);
 assert.doesNotMatch(r.instructions,/UNAUTHORIZED|MRN PRIVATE/);
 assert.ok(calls.filter(c=>c.p.sessionKey).every(c=>['agent:main:echo-app:home',OWNER_DM].includes(c.p.sessionKey)));
 assert.ok(calls.every(c=>!/(send|create|abort|steer)/.test(c.method)));
});
test('unknown owners, groups, patient workflows and other agents receive no private startup packet',async t=>{
 const workspace=await fixture(t);let n=0;
 for(const sessionKey of ['agent:main:whatsapp:group:x','agent:main:patient:123','agent:main:whatsapp:direct:+999','agent:main:echo-app:../../x']) assert.equal(await prepareStartupMemory({workspace,agentId:'main',sessionKey,call:()=>{n++;}}),undefined);
 assert.equal(await prepareStartupMemory({workspace,agentId:'other',sessionKey:'agent:main:main',call:()=>{n++;}}),undefined);assert.equal(n,0);
});
test('permission failure and timeout produce honest degraded context, never reuse a prior packet',async t=>{
 const workspace=await fixture(t), calls=[];
 const r=await prepareStartupMemory({workspace,agentId:'main',sessionKey:'agent:main:echo-app:home',timeoutMs:10,call:fake(calls,{'chat.history':()=>{throw Error('403');},'memory.search':()=>new Promise(()=>{})})});
 assert.equal(r.metadata.status,'partial');assert.match(r.instructions,/unavailable/);assert.doesNotMatch(r.instructions,/AZURE-729/);
});
test('fresh connection re-reads source corrections and preserves bounded unicode-safe context',async t=>{
 const workspace=await fixture(t),calls=[];let value='older';
 const call=fake(calls,{'chat.history':()=>({messages:Array.from({length:12},(_,id)=>({id,role:'user',content:value+' 😀'.repeat(3000)}))})});
 const one=await prepareStartupMemory({workspace,agentId:'main',sessionKey:'agent:main:echo-app:home',call});value='newer';
 const two=await prepareStartupMemory({workspace,agentId:'main',sessionKey:'agent:main:echo-app:home',call});
 assert.match(one.instructions,/older/);assert.match(two.instructions,/newer/);assert.doesNotMatch(two.instructions,/"text":"older/);assert.ok(Buffer.byteLength(two.instructions)<=15000);
});
