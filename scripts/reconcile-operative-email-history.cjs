// Read-only Gmail reconciliation. Stage metadata-only receipts for import at server startup.
// Does not send mail or change/finalize reports. Exact normalized body hashes only.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { reportHash } = require('../server/email-receipts');
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/reconcile-operative-email-history.cjs <private-staging-file>');
const gog = (args) => JSON.parse(execFileSync('gog', [...args, '--account', 'aalami@gmail.com', '--json', '--no-input', '--gmail-no-send'], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 120000, stdio: ['ignore','pipe','pipe'] }));
try {
  const found = gog(['gmail','messages','search','in:sent from:aalami@gmail.com subject:"Operative Report" after:2026/02/01','--all','--max','100','--include-body']);
  const candidates = (found.messages || []).filter(m => /^Operative Report\s*-/i.test(m.subject || '') && typeof m.body === 'string' && m.body.trim().length > 100);
  console.log(JSON.stringify({ candidates: candidates.length }));
  const receipts = [];
  for (const m of candidates) {
    const full = gog(['gmail','get',m.id]);
    if (!full.message?.labelIds?.includes('SENT') || typeof full.body !== 'string') continue;
    const recipients = (full.headers?.to || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
    if (!recipients.length || !full.message.internalDate) continue;
    receipts.push({ messageId:m.id, reportHash:reportHash(full.body), sentAt:new Date(Number(full.message.internalDate)).toISOString(), recipients });
  }
  fs.writeFileSync(output, JSON.stringify({ receipts }), { mode:0o600 });
  console.log(JSON.stringify({ staged:receipts.length, containsReportText:false, sentEmails:0 }));
} catch (_) {
  console.error('Gmail reconciliation could not complete. No partial import or email send performed. Check gog account access/TLS and retry.');
  process.exitCode=1;
}
