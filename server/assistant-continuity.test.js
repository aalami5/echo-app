const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const express = require('express');
const { installAssistantContinuity } = require('./assistant-continuity');
class FakeGateway extends EventEmitter {
  constructor() { super(); this.generation = 1; this.calls = []; this.sent = 0; this.history = []; this.failSend = false; this.active = []; }
  async connect() {}
  close() {}
  async call(method, params) {
    this.calls.push({ method, params });
    if (method === 'chat.send') { this.sent++; if (this.failSend) throw Error('network lost after acceptance'); return { runId: params.idempotencyKey, status: 'started' }; }
    if (method === 'chat.history') return { messages: this.history, sessionInfo: { hasActiveRun: !!this.active.length, activeRunIds: this.active } };
    if (method === 'tasks.list') return { tasks: [] };
    if (method === 'artifacts.list') return { artifacts: [] };
    if (method === 'talk.client.create') return { voiceSessionId: 'voice-one', clientControl: { owner: 'gateway' }, transport: 'webrtc', offerUrl: '/plugins/openai/realtime/calls', clientSecret: 'do-not-expose' };
    return { ok: true };
  }
}
async function fixture(t, rpc = new FakeGateway(), options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-assistant-test-'));
  const app = express(); app.use(express.json({ limit: '10mb' }));
  const instance = installAssistantContinuity(app, { authToken: 'synthetic-token', dataDir: dir, workspace: dir, gatewayUrl: 'http://127.0.0.1:1', rpc, ...options });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.on('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/patients/assistant`;
  const request = async (url, body, token = 'synthetic-token') => {
    const r = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  await request('/bootstrap'); return { rpc, request, instance, dir };
}
test('voice and text use one stable session; new projects cannot select WhatsApp/group sessions', async t => {
  const { rpc, request } = await fixture(t);
  await request('/conversations/home/send', { message: 'Synthetic continuity check', idempotencyKey: 'request_1234' });
  const voice = await request('/conversations/home/voice', {});
  assert.equal(voice.status, 200); assert.equal(voice.data.control, 'gateway'); assert.equal(JSON.stringify(voice).includes('do-not-expose'), false);
  const sends = rpc.calls.filter(c => ['chat.send', 'talk.client.create'].includes(c.method));
  assert.equal(sends[0].params.sessionKey, sends[1].params.sessionKey);
  assert.deepEqual(sends[1].params.capabilities, ['gateway-control-v1', 'voice-transcript']);
  assert.equal((await request('/conversations/agent:main:whatsapp:group/history')).status, 404);
  await request('/conversations/home/voice/voice-one/close', {});
  assert.equal(rpc.calls.some(c => c.method === 'chat.abort'), false, 'ending call must not cancel task');
});
test('recap readiness is authenticated, call-scoped and at-most-once without a chat send', async t=>{
  const upstream=[];
  const {rpc,request}=await fixture(t,new FakeGateway(),{fetchVoice:async(url,options)=>{
    upstream.push({url,options});return new Response(options.headers['Content-Type']==='application/sdp'?'v=0\r\n':'Ready');
  }});
  await request('/conversations/home/voice',{});
  assert.equal((await request('/conversations/home/voice/voice-one/ready',{})).status,409);
  assert.equal((await request('/conversations/expenses/voice/voice-one/ready',{})).status,404);
  assert.equal((await request('/conversations/home/voice/voice-one/ready',{},'wrong-token')).status,403);
  await request('/conversations/home/voice/voice-one/offer',{sdp:'v=0\r\n'});
  const responses=await Promise.all([request('/conversations/home/voice/voice-one/ready',{}),request('/conversations/home/voice/voice-one/ready',{})]);
  assert.ok(responses.every(r=>r.status===200));assert.equal(upstream.length,2);
  assert.equal(upstream[1].options.headers['Content-Type'],'application/vnd.echo.recap-ready+json');
  assert.equal(rpc.sent,0);assert.doesNotMatch(JSON.stringify(responses),/do-not-expose/);
  await request('/conversations/home/voice/voice-one/close',{});
  assert.equal((await request('/conversations/home/voice/voice-one/ready',{})).status,404);
});
test('same request and uploaded PDF are not replayed after lost acknowledgement or restart', async t => {
  const { rpc, request, dir } = await fixture(t);
  const upload = await request('/uploads', { conversationId: 'home', idempotencyKey: 'upload_1234', name: '../../synthetic.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-synthetic').toString('base64') });
  assert.equal(upload.data.fileName, 'synthetic.pdf');
  const body = { message: 'Review test file', idempotencyKey: 'request_5678', attachmentIds: [upload.data.id] };
  const a = await request('/conversations/home/send', body); const b = await request('/conversations/home/send', body);
  assert.equal(a.data.runId, b.data.runId); assert.equal(rpc.sent, 1);
  const c = rpc.calls.find(c => c.method === 'chat.send'); assert.equal(c.params.attachments[0].content, Buffer.from('%PDF-synthetic').toString('base64'));
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'assistant/index.json'))); assert.equal(saved.submissions.request_5678.receipt.runId, a.data.runId);
  assert.equal((await request('/conversations/home/send', { ...body, message: 'different action' })).status, 409);
  assert.equal((await request('/conversations/expenses/send', { ...body, idempotencyKey: 'request_other' })).status, 403);
});
test('uncertain admission does not automatically perform a second external action', async t => {
  const { rpc, request } = await fixture(t); rpc.failSend = true;
  const body = { message: 'Synthetic action', idempotencyKey: 'request_uncertain' };
  assert.equal((await request('/conversations/home/send', body)).status, 503);
  assert.equal((await request('/conversations/home/send', body)).status, 409); assert.equal(rpc.sent, 1);
});
test('unauthorized requests fail closed and cannot read memory or start work', async t => {
  const { request, rpc } = await fixture(t);
  assert.equal((await request('/memory', undefined, 'wrong')).status, 403);
  assert.equal((await request('/conversations/home/send', { message: 'x', idempotencyKey: 'request_bad' }, '')).status, 403); assert.equal(rpc.sent, 0);
  const f = await fixture(t, new FakeGateway(), { authToken: undefined });
  assert.equal((await f.request('/memory')).status, 503);
});
test('history is canonical; events omit analysis and are scoped to selected conversation', async t => {
  const { request, rpc } = await fixture(t);
  rpc.history = Array.from({ length: 150 }, (_, i) => ({ id: `turn-${i}`, role: 'user', content: `test-${i}` }));
  const h = await request('/conversations/home/history?offset=100'); assert.equal(h.data.messages.length, 150);
  assert.equal(rpc.calls.findLast(c => c.method === 'chat.history').params.offset, 100);
  rpc.emit('event', { event: 'chat', payload: { sessionKey: 'agent:main:echo-app:home', state: 'delta', runId: 'one', message: { role: 'assistant', channel: 'analysis', content: 'hidden reasoning' } } });
  rpc.emit('event', { event: 'chat', payload: { sessionKey: 'agent:main:whatsapp:group:123', state: 'delta', message: { role: 'assistant', content: 'group private' } } });
  const e = await request('/conversations/home/events'); assert.equal(JSON.stringify(e).includes('hidden reasoning'), false); assert.equal(JSON.stringify(e).includes('group private'), false);
});
test('stop requires an exact active run; foreign run and voice IDs cannot be acted on', async t => {
  const { request, rpc } = await fixture(t); rpc.active = ['real-run'];
  assert.equal((await request('/conversations/home/stop', { runId: 'other-run' })).status, 409);
  assert.equal((await request('/conversations/home/stop', { runId: 'real-run' })).status, 200);
  await request('/conversations/home/voice', {});
  assert.equal((await request('/conversations/expenses/voice/voice-one/close', {})).status, 404);
  assert.equal((await request('/conversations/home/voice/voice-one/offer', { sdp: 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel' })).status, 400);
});
test('legacy history preserved with provenance and never executed as fresh instructions', async t => {
  const { request, rpc, dir } = await fixture(t);
  const body = { messages: [{ id: 'old', role: 'user', content: 'Old historical instruction', timestamp: '2026-01-01' }] };
  const a = await request('/legacy-history', body); const b = await request('/legacy-history', body);
  assert.equal(a.data.migrationId, b.data.migrationId); assert.equal(rpc.sent, 0);
  const files = fs.readdirSync(path.join(dir, 'assistant/legacy')); assert.equal(files.length, 1);
  assert.match(fs.readFileSync(path.join(dir, 'assistant/legacy', files[0]), 'utf8'), /legacy-device-cache/);
});

test('uncertain request is reconciled from native input custody without resubmission', async t => {
  const {request,rpc,instance}=await fixture(t);rpc.failSend=true;
  await request('/conversations/home/send',{message:'Synthetic action',idempotencyKey:'request_custody'});
  const call=rpc.call.bind(rpc);rpc.call=async(method,params)=>method==='chat.history'?{messages:[],sessionInfo:{},inputReceipts:[{runId:'request_custody',state:'consumed',consumedByEventId:'one'}]}:call(method,params);
  const a=await request('/conversations/home/activity');assert.equal(a.status,200);
  assert.equal(a.data.submissions[0].state,'accepted');assert.equal(instance.state.submissions.request_custody.receipt.runId,'request_custody');assert.equal(rpc.sent,1);
});
test('concurrent startup uses the protocol key and subscribes once per connection', async t=>{
 const {rpc,request}=await fixture(t);rpc.calls=[];rpc.generation++;
 await Promise.all([request('/conversations/home/history'),request('/conversations/home/activity'),request('/conversations/home/events')]);
 const subs=rpc.calls.filter(x=>x.method==='sessions.messages.subscribe');assert.equal(subs.length,1);assert.deepEqual(subs[0].params,{key:'agent:main:echo-app:home'});
});

test('voice status events stay with their call and never expose raw tool arguments', async t => {
  const {request,rpc}=await fixture(t);
  await request('/conversations/home/voice',{});
  rpc.emit('event',{event:'talk.event',payload:{voiceSessionId:'voice-one',talkEvent:{type:'tool.call',payload:{args:{secret:'sensitive-arguments'}}}}});
  rpc.emit('event',{event:'talk.event',payload:{voiceSessionId:'unrelated',talkEvent:{type:'transcript.done',payload:{text:'other-call'}}}});
  const home=await request('/conversations/home/events'); const project=await request('/conversations/expenses/events');
  assert.equal(home.data.events.length,1);assert.equal(home.data.events[0].state,'tool.call');
  assert.equal(JSON.stringify(home).includes('sensitive-arguments'),false);assert.equal(project.data.events.length,0);
});

test('managed result links are downloaded through the authenticated adapter, not opened on the phone as relative URLs', async t => {
  const rpc = new FakeGateway(); const original = rpc.call.bind(rpc);
  rpc.call = async (method, params) => method === 'artifacts.download'
    ? { artifact: { id: 'result-1' }, url: '/api/chat/media/outgoing/test/file/full?signature=synthetic' }
    : original(method, params);
  let fetched;
  const { request } = await fixture(t, rpc, { fetchArtifact: async (url, options) => {
    fetched = { url, options }; return new Response('COPPER MAPLE 731');
  } });
  const r = await request('/conversations/home/artifacts/result-1');
  assert.equal(r.status, 200); assert.equal(r.data.encoding, 'base64');
  assert.equal(Buffer.from(r.data.data, 'base64').toString(), 'COPPER MAPLE 731');
  assert.equal(r.data.url, undefined); assert.equal(fetched.url.origin, 'http://127.0.0.1:1');
  assert.equal(fetched.options.redirect, 'error');
});

test('external artifact URLs are not fetched with gateway authority; oversized native files are rejected', async t => {
  const rpc = new FakeGateway(); const original = rpc.call.bind(rpc); let url = 'https://example.invalid/file'; let fetches = 0;
  rpc.call = async (method, params) => method === 'artifacts.download' ? { url } : original(method, params);
  const { request } = await fixture(t, rpc, { fetchArtifact: async () => {
    fetches++; return new Response('too large', { headers: { 'content-length': String(13 * 1024 * 1024) } });
  } });
  const external = await request('/conversations/home/artifacts/result-2');
  assert.equal(external.data.url, url); assert.equal(fetches, 0);
  url = '/api/chat/media/outgoing/test/file/full?signature=synthetic';
  assert.equal((await request('/conversations/home/artifacts/result-2')).status, 413);
});

test('camera/photo uploads reach the same native voice conversation as image attachments', async t => {
  const {rpc,request}=await fixture(t);
  await request('/conversations/home/voice',{});
  const content=Buffer.from('synthetic-image-bytes').toString('base64');
  const upload=await request('/uploads',{conversationId:'home',idempotencyKey:'camera_frame_1234',name:'Camera photo.jpg',mimeType:'image/jpeg',content});
  assert.equal(upload.status,200);assert.equal(rpc.sent,0,'preview/upload alone must not trigger a response');
  const body={message:'What is in this photo?',idempotencyKey:'camera_send_1234',attachmentIds:[upload.data.id]};
  assert.equal((await request('/conversations/expenses/send',body)).status,403);
  assert.equal((await request('/conversations/home/send',body)).status,200);
  const voice=rpc.calls.find(c=>c.method==='talk.client.create'),send=rpc.calls.find(c=>c.method==='chat.send');
  assert.equal(send.params.sessionKey,voice.params.sessionKey);assert.equal(send.params.attachments[0].type,'image');assert.equal(send.params.attachments[0].mimeType,'image/jpeg');assert.equal(send.params.attachments[0].content,content);
  assert.equal((await request('/conversations/home/send',body)).status,200);assert.equal(rpc.sent,1);
});
