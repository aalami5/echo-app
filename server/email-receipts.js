// Server-owned email history, separate from device-supplied report snapshots.
// Contains IDs/digests and delivery metadata only, never report bodies or patient names.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const normalizeReport = (text) => text.replace(/\r\n?/g, '\n').trim();
const reportHash = (text) => crypto.createHash('sha256').update(normalizeReport(text)).digest('hex');
const error = (message, statusCode) => Object.assign(new Error(message), { statusCode });

function createReceiptLedger(file, deliver) {
  const read = () => {
    if (!fs.existsSync(file)) return { version: 1, receipts: [], attempts: [] };
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.receipts) || !Array.isArray(data.attempts)) {
      throw error('Email history is unavailable; sending is paused to prevent duplicate emails.', 503);
    }
    return data;
  };
  const write = (data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    const fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  };
  const publicHistory = () => ({ receipts: read().receipts });
  async function send(body) {
    if (typeof body.report !== 'string' || !body.report.trim()) throw error('Missing operative report text', 400);
    if (body.report.length > 200000) throw error('Operative report is too large to email', 413);
    const hash = reportHash(body.report);
    const reportId = body.reportId || `legacy-${hash}`;
    const requestId = body.requestId || `initial-${reportId}-${hash}`;
    if (![reportId, requestId].every((id) => typeof id === 'string' && /^[a-zA-Z0-9:_-]{1,200}$/.test(id))) {
      throw error('Invalid report or request ID', 400);
    }
    let data = read();
    const attempt = data.attempts.find((a) => a.requestId === requestId);
    if (attempt && (attempt.reportId !== reportId || attempt.reportHash !== hash)) throw error('Request ID already belongs to another report version', 409);
    const receipt = data.receipts.find((r) => r.requestId === requestId) ||
      (!body.resend && data.receipts.find((r) => r.reportHash === hash && (r.reportId === reportId || !r.reportId)));
    if (receipt) return { success: true, receipt, ...receipt, alreadySent: true };
    // A transport timeout or process crash is ambiguous, never automatically send again.
    if (data.attempts.some((a) => a.reportId === reportId && a.state !== 'sent')) {
      throw error('Delivery is not yet confirmed. Check email history before retrying; no duplicate email was sent.', 409);
    }
    data.attempts.push({ requestId, reportId, reportHash: hash, state: 'pending', startedAt: new Date().toISOString() });
    write(data); // Persist intent BEFORE contacting Gmail. Fails closed if storage is unavailable.
    try {
      const result = await deliver({ report: normalizeReport(body.report), subject: body.subject });
      if (!result.success || !result.messageId) throw error('Gmail delivery could not be confirmed', 502);
      const receipt = {
        id: crypto.randomUUID(), requestId, reportId: body.reportId || undefined, reportHash: hash,
        messageId: result.messageId, sentAt: result.sentAt,
        recipients: result.recipients, source: 'gmail',
      };
      data = read(); // Another report may have completed while this one was sending.
      data.receipts.push(receipt);
      data.attempts.find((a) => a.requestId === requestId).state = 'sent';
      write(data);
      return { success: true, ...receipt, receipt };
    } catch (_) {
      throw error('Email delivery is unconfirmed. Check sent history before retrying to avoid sending a duplicate.', 502);
    }
  }
  function importReceipt(receipt) {
    const data = read();
    if (!receipt.messageId || !/^[a-f0-9]{64}$/.test(receipt.reportHash) || !Number.isFinite(Date.parse(receipt.sentAt)) || !Array.isArray(receipt.recipients)) throw error('Invalid historical receipt', 400);
    if (data.receipts.some((r) => r.messageId === receipt.messageId)) return false;
    // Only a single unconfirmed attempt with an exact body match can be reconciled.
    const matches = data.attempts.filter((a) => a.state !== 'sent' && a.reportHash === receipt.reportHash && Date.parse(receipt.sentAt) >= Date.parse(a.startedAt) - 60000);
    const match = matches.length === 1 ? matches[0] : null;
    if (match) match.state = 'sent';
    data.receipts.push({ ...receipt, id: crypto.randomUUID(), source: 'gmail-history', ...(match ? { reportId: match.reportId, requestId: match.requestId } : {}) });
    write(data);
    return true;
  }
  function linkKnownReports(links) {
    if (!Array.isArray(links) || links.length > 1000) throw error('Invalid receipt links', 400);
    const data = read();
    for (const link of links) {
      if (typeof link.reportId !== 'string' || !/^[a-zA-Z0-9:_-]{1,200}$/.test(link.reportId) || !/^[a-f0-9]{64}$/.test(link.reportHash)) throw error('Invalid receipt link', 400);
      for (const receipt of data.receipts) {
        if (!receipt.reportId && receipt.reportHash === link.reportHash) {
          receipt.linkedReportIds = Array.from(new Set([...(receipt.linkedReportIds || []), link.reportId]));
        }
      }
    }
    write(data);
    return { receipts: data.receipts };
  }
  return { send, publicHistory, importReceipt, linkKnownReports };
}
module.exports = { createReceiptLedger, reportHash, normalizeReport };
