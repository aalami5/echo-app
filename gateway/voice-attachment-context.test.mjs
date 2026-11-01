import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { attachVoiceAttachmentContext, handleAttachmentContextRequest } from './voice-attachment-context.mjs';
const payload = { voiceSessionId: 'voice-one', id: 'upload_12345', stage: 'received', files: [{ name: 'photo.jpg', mimeType: 'image/jpeg' }] };
function setup(ack = true) {
  const events = [];
  const bridge = { isConnected: () => true, handleEvent() {}, close() {}, sendEvent(event) {
    events.push(event);
    queueMicrotask(() => this.handleEvent(ack ? { type: 'conversation.item.added', item: { id: event.item.id } } : { type: 'error', error: { event_id: event.event_id } }));
  } };
  const controller = attachVoiceAttachmentContext(bridge, { agentId: 'main', echoVoiceSessionId: 'voice-one', gatewayControl: {} });
  return { bridge, controller, events };
}
test('receipt is silent reference context, acknowledged by provider, and at-most-once', async () => {
  const { controller, events } = setup();
  assert.deepEqual(await controller.receive(payload), { acknowledged: true });
  assert.deepEqual(await controller.receive(payload), { acknowledged: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'conversation.item.create');
  assert.match(events[0].item.content[0].text, /not a new user instruction/);
  assert.equal(events.some(e => e.type === 'response.create' || e.type === 'session.update'), false);
  await assert.rejects(controller.receive({ ...payload, files: [{ name: 'changed.txt' }] }), /content changed/);
});
test('analysis arrives as a separate completed result; file text cannot become protocol fields', async () => {
  const { controller, events } = setup();
  await controller.receive(payload);
  await controller.receive({ ...payload, stage: 'completed', result: 'The image says COPPER MAPLE 731.' });
  assert.equal(events.length, 2);
  assert.match(events[1].item.content[0].text, /COPPER MAPLE 731/);
  assert.deepEqual(Object.keys(events[1].item).sort(), ['content', 'id', 'role', 'type']);
});
test('foreign calls and malformed receipts are rejected without context injection', async () => {
  const { controller, events } = setup();
  assert.equal(attachVoiceAttachmentContext({}, { agentId: 'main', echoVoiceSessionId: 'voice-one', clientControl: { owner: 'gateway' } }), undefined);
  await assert.rejects(controller.receive({ ...payload, voiceSessionId: 'another-call' }), /Wrong voice session/);
  await assert.rejects(controller.receive({ ...payload, stage: 'execute' }), /Invalid stage/);
  await assert.rejects(controller.receive({ ...payload, files: [] }), /Invalid files/);
  assert.equal(events.length, 0);
});
test('provider rejection does not claim delivery or automatically replay', async () => {
  const { controller, events } = setup(false);
  assert.deepEqual(await controller.receive(payload), { acknowledged: false });
  assert.deepEqual(await controller.receive(payload), { acknowledged: false });
  assert.equal(events.length, 1);
});
test('HTTP context delivery needs an active call capability and is size-bounded', async () => {
  const results = []; const respond = (_res, code) => results.push(code);
  await handleAttachmentContextRequest(Readable.from([JSON.stringify(payload)]), {}, undefined, respond);
  assert.deepEqual(results, [404]);
  const { controller, events } = setup();
  await handleAttachmentContextRequest(Readable.from([Buffer.from(JSON.stringify(payload))]), {}, { echoAttachmentContext: controller }, respond);
  assert.equal(results.at(-1), 200);
  await handleAttachmentContextRequest(Readable.from([Buffer.alloc(49 * 1024)]), {}, { echoAttachmentContext: controller }, respond);
  assert.equal(results.at(-1), 413); assert.equal(events.length, 1);
});
