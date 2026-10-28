import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {claimRecap,recapData,createRecapController,attachVoiceRecap,prepareBrowserRecap,recapResponse} from '../gateway/voice-recap.mjs';
import {armBrowserRecap} from '../gateway/browser-recap.mjs';
const packet=()=>({version:1,capturedAt:new Date().toISOString(),status:'ready',sources:[{tasks:[
 {title:'Needs decision',status:'blocked'}, {title:'Released feature',status:'completed',updatedAt:new Date().toISOString()},
 {title:'Old task',status:'completed',updatedAt:'2020-01-01'}, {title:'Patient MRN 123456',status:'running'}],
 turns:[{role:'assistant',text:'I will finish the review.'},{role:'user',text:'Patient record PRIVATE'},{role:'user',text:'Contact person@example.com'}]}]});
const instructions=p=>'Prefix\n'+JSON.stringify(p);
async function workspace(t){const w=await fs.mkdtemp(path.join(os.tmpdir(),'echo-recap-'));t.after(()=>fs.rm(w,{recursive:true,force:true}));return w;}
function clock(){let callback;return {schedule:fn=>{callback=fn;return 1;},unschedule:()=>{callback=undefined;},tick:async()=>{const fn=callback;callback=undefined;await fn?.();}};}
test('priorities distinguish new completions from old notes and omit sensitive data',()=>{
 const d=recapData(packet(),Date.now()-5000);assert.equal(d.tasks[0].status,'blocked');assert.equal(d.tasks[1].changedSinceLastCall,true);assert.equal(d.tasks[2].changedSinceLastCall,false);
 assert.equal(d.recentDiscussion.length,1);assert.doesNotMatch(JSON.stringify(d),/PRIVATE|MRN|example.com/);
 const r=recapResponse(d);assert.equal(r.tool_choice,'none');assert.deepEqual(r.tools,[]);assert.equal(r.conversation,'none');
 const p=packet();p.capturedAt='2000-01-01';assert.deepEqual(recapData(p,0).tasks,[]);assert.equal(recapData(p,0).status,'unavailable');
});
test('checkpoint claims are atomic, survive process reads, and contain no transcript',async t=>{
 const w=await workspace(t);const a=await Promise.all([claimRecap(w,'call-1',100),claimRecap(w,'call-1',101)]);
 assert.equal(a.filter(Boolean).length,1);assert.equal(await claimRecap(w,'call-1',102),null);
 assert.deepEqual(await claimRecap(w,'call-2',200),{previousAt:100});
 const text=await fs.readFile(path.join(w,'data/assistant/voice-recap-state.json'),'utf8');assert.doesNotMatch(text,/title|text|instructions/);
});
test('waits for readiness and never repeats on duplicate ready or provider reconnect',async()=>{
 const c=clock(),spoken=[];const ctrl=createRecapController({...c,claim:async()=>({previousAt:5}),isIdle:()=>true,speak:x=>spoken.push(x),data:p=>p});
 await c.tick();assert.equal(spoken.length,0);ctrl.ready();ctrl.ready();await c.tick();assert.deepEqual(spoken,[5]);
 ctrl.event('response.done');ctrl.ready();await c.tick();assert.equal(spoken.length,1);
});
test('speech first, other output, close and interruption cancel the recap without replay',async()=>{
 for(const event of ['input_audio_buffer.speech_started','response.created','session.continuity.reset','close']){
  const c=clock();let n=0;const ctrl=createRecapController({...c,claim:async()=>({previousAt:0}),isIdle:()=>true,speak:()=>n++,data:()=>({})});
  ctrl.ready();event==='close'?ctrl.close():ctrl.event(event);await c.tick();ctrl.ready();await c.tick();assert.equal(n,0,event);
 }
 const c=clock();let cancel=0;const ctrl=createRecapController({...c,claim:async()=>({previousAt:0}),isIdle:()=>true,speak:()=>{},cancel:()=>cancel++,data:()=>({})});
 ctrl.ready();await c.tick();ctrl.event('input_audio_buffer.speech_started');assert.equal(cancel,1);assert.equal(ctrl.state,'skipped');
});
test('late checkpoint after user speech, busy bridge, and failed persistence never speak',async()=>{
 const c=clock();let resolve,n=0;const ctrl=createRecapController({...c,claim:()=>new Promise(r=>resolve=r),isIdle:()=>true,speak:()=>n++,data:()=>({})});
 ctrl.ready();const pending=c.tick();ctrl.event('input_audio_buffer.speech_started');resolve({previousAt:0});await pending;assert.equal(n,0);
 for(const [idle,claim] of [[false,async()=>({})],[true,async()=>{throw Error('disk');}]]){
  const k=clock();const x=createRecapController({...k,isIdle:()=>idle,claim,speak:()=>n++,data:()=>({})});x.ready();await k.tick();assert.equal(n,0);
 }
});
test('bridge integration preserves existing events, close and one tool-free response',async t=>{
 const w=await workspace(t),sent=[],events=[];
 const bridge={config:{onEvent:e=>events.push(e)},isConnected:()=>true,responseActive:false,responseCreateState:'idle',pendingToolCallIds:new Set(),
 sendEvent:e=>sent.push(e),requestResponseCreate(){this.sendEvent({type:'response.create'});},close(){this.closed=true;}};
 const ctrl=attachVoiceRecap(bridge,{agentId:'main',workspaceDir:w,echoVoiceSessionId:'native-call',instructions:instructions(packet())});assert.ok(ctrl);
 ctrl.ready();await new Promise(r=>setTimeout(r,850));assert.equal(sent.length,1);assert.equal(sent[0].response.tool_choice,'none');
 bridge.config.onEvent({type:'input_audio_buffer.speech_started'});assert.equal(events.length,1);bridge.close();assert.equal(bridge.closed,true);
 assert.equal(attachVoiceRecap(bridge,{agentId:'other',instructions:instructions(packet())}),undefined);
});
test('browser waits for both data channel and media; reconnect does not repeat',async t=>{
 const w=await workspace(t);const echoRecap=await prepareBrowserRecap(instructions(packet()),w,'browser-call');assert.ok(echoRecap);
 assert.equal(await prepareBrowserRecap(instructions(packet()),w,'browser-call'),undefined);
 const channel=new EventTarget(),peer=new EventTarget(),sent=[],c=clock();channel.readyState='open';channel.send=v=>sent.push(JSON.parse(v));peer.connectionState='connecting';
 armBrowserRecap({...c,channel,peer,session:{echoRecap,voiceSessionId:'browser-call'},isCurrent:()=>true});await c.tick();assert.equal(sent.length,0);
 peer.connectionState='connected';peer.dispatchEvent(new Event('connectionstatechange'));await c.tick();assert.equal(sent.length,1);
 peer.connectionState='disconnected';peer.dispatchEvent(new Event('connectionstatechange'));peer.connectionState='connected';peer.dispatchEvent(new Event('connectionstatechange'));await c.tick();assert.equal(sent.length,1);
});
test('browser speech before readiness suppresses recap; no private packet means no greeting',async()=>{
 const channel=new EventTarget(),peer=new EventTarget(),c=clock();let n=0;channel.send=()=>n++;channel.readyState='open';peer.connectionState='connected';
 assert.equal(armBrowserRecap({channel,peer,session:{},isCurrent:()=>true}),undefined);
 const ctrl=armBrowserRecap({...c,channel,peer,session:{echoRecap:{version:1,createdAt:Date.now(),response:recapResponse({})}},isCurrent:()=>true});
 const event=new Event('message');event.data=JSON.stringify({type:'input_audio_buffer.speech_started'});channel.dispatchEvent(event);await c.tick();assert.equal(n,0);assert.equal(ctrl.state,'skipped');
});
