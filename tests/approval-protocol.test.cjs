const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), ts = require('typescript');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const { actionable, ApprovalActions, approvalFingerprint, pendingApprovals, briefDefinition, briefState } = require('../src/services/approvalProtocol.ts');
const { BriefActions, listBriefs } = require('../src/services/briefWorkflow.ts');
const fixture = () => ({id:'approval-1',status:'pending',expiresAtMs:2000,presentation:{kind:'exec',commandText:'read inbox',allowedDecisions:['allow-once','allow-always','deny'],scope:{kind:'standing-grant',automation:'Daily brief',command:'read inbox',expiresInDays:30}}});
const settings = {hour:7,minute:30,timezone:'America/Los_Angeles',gmail:'aalami@gmail.com',includeStanford:false,destination:'+16505550123'};
function rpcFor(row) { const calls=[];return {calls, async request(method,p){calls.push([method,p]);if(method==='approval.get')return {approval:row};if(method==='approval.resolve'){row.status=p.decision==='deny'?'denied':'allowed';row.decision=p.decision;return {ok:true}}throw Error(method)}}; }
test('expired, denied and malformed requests cannot be actioned',()=>{
 assert.ok(actionable(fixture(),1000));for(const patch of [{status:'denied'},{expiresAtMs:1000},{id:''},{presentation:{kind:'exec',commandText:'',allowedDecisions:['deny']}}])assert.ok(!actionable({...fixture(),...patch},1000));
});
test('one-time approval re-fetches exact request and verifies terminal receipt',async()=>{
 const row=fixture(),rpc=rpcFor(row);await new ApprovalActions(rpc,()=>1000).decide(structuredClone(row),'allow-once');assert.deepEqual(rpc.calls.map(x=>x[0]),['approval.get','approval.resolve','approval.get']);
});
for(const [label,mutate] of [['changed command',a=>a.presentation.commandText='send elsewhere'],['changed scope',a=>a.presentation.scope.automation='Other'],['expired',a=>a.expiresAtMs=999],['already denied',a=>a.status='denied']])test(label+' blocks resolution',async()=>{
 const row=fixture(),shown=structuredClone(row);mutate(row);const rpc=rpcFor(row);await assert.rejects(new ApprovalActions(rpc,()=>1000).decide(shown,'allow-once'));assert.equal(rpc.calls.filter(x=>x[0]==='approval.resolve').length,0);
});
test('object property order does not create a false mismatch',()=>{const a=fixture(),b=structuredClone(a);b.presentation={...b.presentation,commandText:b.presentation.commandText};assert.equal(approvalFingerprint(a),approvalFingerprint(b));});
test('broad allow-always is refused; standing grant is accepted',async()=>{
 const row=fixture();delete row.presentation.scope;const rpc=rpcFor(row);await assert.rejects(new ApprovalActions(rpc,()=>1000).decide(structuredClone(row),'allow-always'),/scoped automation/);assert.equal(rpc.calls.length,1);
 const scoped=fixture();await new ApprovalActions(rpcFor(scoped),()=>1000).decide(structuredClone(scoped),'allow-always');assert.equal(scoped.decision,'allow-always');
});
test('double tap resolves at most once',async()=>{
 const row=fixture(),rpc=rpcFor(row),actions=new ApprovalActions(rpc,()=>1000),shown=structuredClone(row);
 const results=await Promise.allSettled([actions.decide(shown,'allow-once'),actions.decide(shown,'allow-once')]);assert.equal(results.filter(x=>x.status==='rejected').length,1);assert.equal(rpc.calls.filter(x=>x[0]==='approval.resolve').length,1);
});
test('timeout has no automatic retry',async()=>{let resolves=0;const row=fixture();const rpc={async request(m){if(m==='approval.get')return {approval:row};resolves++;throw Error('timeout')}};await assert.rejects(new ApprovalActions(rpc,()=>1000).decide(row,'allow-once'),/timeout/);assert.equal(resolves,1)});
test('unverified resolution is not reported as success',async()=>{const row=fixture();const rpc={async request(m){return m==='approval.get'?{approval:row}:{} }};await assert.rejects(new ApprovalActions(rpc,()=>1000).decide(row,'allow-once'),/not confirmed/)});
test('pending discovery is read-only and excludes terminal records',async()=>{
 const a=fixture();a.expiresAtMs=Date.now()+50000;const rpc={async request(m,p){if(m==='exec.approval.list')return [{id:'a'},{id:'b'}];assert.equal(m,'approval.get');return {approval:p.id==='a'?a:{...a,status:'denied'}}}};assert.equal((await pendingApprovals(rpc)).length,1);
});
test('partial discovery fails closed',async()=>{const rpc={async request(m,p){if(m==='exec.approval.list')return [{id:'a'},{id:'b'}];if(p.id==='b')throw Error('offline');return {approval:fixture()}}};await assert.rejects(pendingApprovals(rpc),/Some approval details/)});
test('brief definition limits account, action and delivery without implicit approval',()=>{
 const job=briefDefinition(settings);assert.equal(job.schedule.expr,'30 7 * * *');assert.equal(job.schedule.tz,settings.timezone);assert.equal(job.delivery.to,settings.destination);assert.deepEqual(job.payload.toolsAllow,['exec']);assert.match(job.payload.message,/--gmail-no-send/);assert.match(job.payload.message,/Stanford was NOT checked/);
});
for(const patch of [{hour:24},{minute:-1},{gmail:'a@gmail.com;send'},{timezone:'Invalid/Zone'},{destination:'group@g.us'},{includeStanford:true}])test('invalid brief setting rejected '+JSON.stringify(patch),()=>assert.throws(()=>briefDefinition({...settings,...patch})));
test('existing morning brief prevents duplicate creation, including disabled schedules',async()=>{
 const calls=[];const rpc={async request(m){calls.push(m);return {jobs:[{id:'old',name:'daily-gmail-review-whatsapp',enabled:false}],hasMore:false}}};await assert.rejects(new BriefActions(rpc).create(settings),/already exists/);assert.deepEqual(calls,['cron.list']);
});
test('declarative create reconciles nested job response',async()=>{
 let created=false;const job={id:'j',name:'Echo Morning Brief',declarationKey:'echo-morning-brief-v1'};const rpc={async request(m,p){if(m==='cron.list')return {jobs:created?[job]:[],hasMore:false};assert.equal(m,'cron.add');created=true;return {job}}};assert.equal((await new BriefActions(rpc).create(settings)).id,'j');
});
test('stale schedule fails before changing it',async()=>{
 const calls=[];const rpc={async request(m){calls.push(m);return {jobs:[{id:'j',name:'Echo Morning Brief',configRevision:'new'}]}}};await assert.rejects(new BriefActions(rpc).setEnabled({id:'j',configRevision:'old'},false),/changed/);assert.deepEqual(calls,['cron.list']);
});
test('pause uses server optimistic concurrency and checks postcondition',async()=>{
 let job={id:'j',name:'Echo Morning Brief',configRevision:'r1',enabled:true};const rpc={async request(m,p){if(m==='cron.list')return {jobs:[{...job}]};assert.equal(m,'cron.update');assert.equal(p.expectedConfigRevision,'r1');job.enabled=p.patch.enabled}};assert.equal((await new BriefActions(rpc).setEnabled({...job},false)).enabled,false);
});
test('grant revocation requires confirmed revoked record',async()=>{const rpc={async request(m){return m.endsWith('.list')?{grants:[{grantId:'g',revokedAtMs:null}]}:{outcome:'revoked'}}};await assert.rejects(new BriefActions(rpc).revoke('g'),/not confirmed/)});
test('schedule status never implies that permission or delivery is proven',()=>{
 assert.equal(briefState({enabled:true,id:'j'},[]),'Scheduled · permission not verified');assert.equal(briefState({enabled:false,id:'j'},[]),'Paused');assert.match(briefState({enabled:true,id:'j'},[{cronJobId:'j',revokedAtMs:null,expiresAtMs:null}]),/check last run/);
});
