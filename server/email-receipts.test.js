const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createReceiptLedger, reportHash } = require('./email-receipts');
const fixture = (t, send) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-receipts-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'ledger.json');
  return { file, ledger: createReceiptLedger(file, send) };
};
const delivered = () => ({ success: true, messageId: 'synthetic-gmail-id', sentAt: new Date().toISOString(), recipients: ['test@example.invalid'] });
const input = { reportId: 'report-a', report: 'Synthetic operative report\nNo patient data.', requestId: 'req-a' };
test('receipt survives restart and retries do not resend; contains no report body', async (t) => {
  let count = 0;
  const { file, ledger } = fixture(t, async () => { count++; return delivered(); });
  const first = await ledger.send(input);
  const reloaded = createReceiptLedger(file, async () => { throw new Error('must not send'); });
  assert.equal((await reloaded.send(input)).receipt.id, first.receipt.id);
  assert.equal((await reloaded.send({ ...input, requestId: 'another' })).alreadySent, true);
  assert.equal(count, 1);
  assert.equal(fs.readFileSync(file, 'utf8').includes(input.report), false);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
test('edits and explicit resends preserve all receipts', async (t) => {
  const { ledger } = fixture(t, async () => delivered());
  await ledger.send(input);
  await ledger.send({ ...input, report: 'Revised synthetic report', requestId: 'rev' });
  await ledger.send({ ...input, requestId: 'resend', resend: true });
  assert.equal(ledger.publicHistory().receipts.length, 3);
  await ledger.send({ ...input, requestId: 'resend', resend: true });
  assert.equal(ledger.publicHistory().receipts.length, 3);
});
test('concurrent duplicate delivery blocked; unrelated reports retained', async (t) => {
  let release;
  const { ledger } = fixture(t, () => new Promise((resolve) => { release = resolve; }));
  const pending = ledger.send(input);
  await assert.rejects(ledger.send({ ...input, requestId: 'duplicate', resend: true }), { statusCode: 409 });
  release(delivered()); await pending;
  assert.equal(ledger.publicHistory().receipts.length, 1);
});
test('uncertain failure stays unconfirmed across restart, no false Sent or duplicate', async (t) => {
  const { file, ledger } = fixture(t, async () => { throw new Error('timeout'); });
  await assert.rejects(ledger.send(input), { statusCode: 502 });
  assert.equal(ledger.publicHistory().receipts.length, 0);
  await assert.rejects(createReceiptLedger(file, async () => delivered()).send({ ...input, requestId: 'retry', resend: true }), { statusCode: 409 });
  ledger.importReceipt({ reportHash: reportHash(input.report), ...delivered() });
  assert.equal((await ledger.send(input)).alreadySent, true);
});
test('corrupt/unwritable ledger fails before sending', async (t) => {
  let count = 0;
  const { file, ledger } = fixture(t, async () => { count++; return delivered(); });
  fs.writeFileSync(file, 'bad-json');
  await assert.rejects(ledger.send(input));
  assert.equal(count, 0);
});
test('legacy clients retained; Gmail messageId required; validation before sending', async (t) => {
  const { ledger } = fixture(t, async () => ({ success: true }));
  await assert.rejects(ledger.send({ report: '' }), { statusCode: 400 });
  await assert.rejects(ledger.send({ ...input, reportId: '../bad' }), { statusCode: 400 });
  await assert.rejects(ledger.send({ report: input.report }), { statusCode: 502 });
  assert.equal(ledger.publicHistory().receipts.length, 0);
});
test('historical imports deduplicate and only attach exact hashes', async (t) => {
  const { ledger } = fixture(t, async () => delivered());
  const receipt = { ...delivered(), reportHash: reportHash(input.report) };
  assert.equal(ledger.importReceipt(receipt), true);
  assert.equal(ledger.importReceipt(receipt), false);
  assert.equal((await ledger.send(input)).alreadySent, true);
  assert.equal(ledger.publicHistory().receipts[0].reportId, undefined);
});
test('historical exact matches acquire stable report links that survive edits', (t) => {
  const { ledger } = fixture(t, async () => delivered());
  ledger.importReceipt({ ...delivered(), reportHash:reportHash(input.report) });
  ledger.linkKnownReports([{reportId:'restored-report',reportHash:reportHash(input.report)}]);
  ledger.linkKnownReports([{reportId:'unrelated',reportHash:reportHash('different')}]);
  assert.deepEqual(ledger.publicHistory().receipts[0].linkedReportIds,['restored-report']);
});
