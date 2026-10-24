const {allowed}=require('./registry.cjs');
const BASE=['agent:main:whatsapp:direct:+16503153236','agent:main:echo-app:home','agent:main:echo-app:echo','agent:main:echo-app:noharm','agent:main:echo-app:expenses','agent:main:echo-app:woodside'];
async function snapshot(registry,call){
 const managed=registry.list();const keys=[...new Set([...BASE,...managed.flatMap(t=>t.sources).filter(allowed)])].slice(0,20);
 const observed=[],unavailable=[];
 await Promise.all(keys.map(async sessionKey=>{
  const results=await Promise.allSettled([call('tasks.list',{sessionKey,limit:30}),call('chat.history',{sessionKey,limit:1,maxChars:100})]);
  if(results[0].status==='fulfilled')for(const t of results[0].value.tasks||[]){
   if((t.ownerKey||t.sessionKey)!==sessionKey)continue;
   if(managed.some(m=>m.runId===t.runId))continue;
   const status=['running','queued','waiting'].includes(t.status)?t.status:['failed','cancelled'].includes(t.status)?t.status:['completed','succeeded'].includes(t.status)?'run_finished':'needs_review';
   observed.push({id:'run:'+t.id,title:t.kind==='cli'?'Earlier assistant run':String(t.title||'Background task').slice(0,100),status,readOnly:true,goal:'Existing OpenClaw execution record',summary:status==='run_finished'?'Execution finished. This alone does not verify its external result.':String(t.terminalSummary||'').slice(0,500),nextStep:'',sources:[sessionKey],evidence:[],notes:[],updatedAt:t.updatedAt||t.createdAt,runId:t.runId});
  }else unavailable.push(sessionKey);
  if(results[1].status==='fulfilled')for(const runId of results[1].value.sessionInfo?.activeRunIds||[]){
   if(managed.some(m=>m.runId===runId)||observed.some(t=>t.runId===runId))continue;
   observed.push({id:'active:'+runId,title:sessionKey.includes('whatsapp')?'WhatsApp request':'Echo request',status:'running',readOnly:true,goal:'Current assistant execution',summary:'Action-level details are not yet recorded.',nextStep:'',sources:[sessionKey],evidence:[],notes:[],runId,updatedAt:Date.now()});
  }else unavailable.push(sessionKey);
 }));
 return {tasks:[...managed,...observed].sort((a,b)=>b.updatedAt-a.updatedAt),capturedAt:Date.now(),partial:unavailable.length>0,unavailableSources:[...new Set(unavailable)]};
}
module.exports={snapshot};
