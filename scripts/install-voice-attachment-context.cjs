// Version-pinned local integration. --check validates anchors without writes.
// Never patches auth, scopes, policy, provider credentials, or tool execution.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const dist = '/opt/homebrew/lib/node_modules/openclaw/dist';
const sourceRoot = path.resolve(__dirname, '..');
function once(text, needle, replacement) {
  if (text.split(needle).length !== 2) throw Error('Unsupported gateway build; expected one anchor: ' + needle.slice(0, 80));
  return text.replace(needle, replacement);
}
function patches() {
  const modulePath = JSON.stringify(path.join(sourceRoot, 'gateway/voice-attachment-context.mjs'));
  const outputs = [];
  const edit = (name, fn) => {
    const file = path.join(dist, name), old = fs.readFileSync(file, 'utf8');
    if (old.includes('// Echo attachment-context v1')) return;
    outputs.push({ file, old, next: fn(old) + '\n// Echo attachment-context v1\n' });
  };
  edit('realtime-voice-provider-factory-9xg-AT4f.mjs', text => {
    text = `import { attachVoiceAttachmentContext as echoAttachVoiceAttachmentContext } from ${modulePath};\n` + text;
    return once(text, '\t\t\t\techoAttachVoiceRecap(bridge, req);', '\t\t\t\techoAttachVoiceRecap(bridge, req);\n\t\t\t\techoAttachVoiceAttachmentContext(bridge, req);');
  });
  edit('realtime-quicksilver-session-B4t6Fo1I.mjs', text => {
    text = `import { handleAttachmentContextRequest as echoHandleAttachmentContextRequest } from ${modulePath};\n` + text;
    const anchor = '\t\tif (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() === "application/vnd.echo.recap-ready+json") {';
    text = once(text, anchor, '\t\tif (req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() === "application/vnd.echo.attachment-context+json") {\n\t\t\tawait echoHandleAttachmentContextRequest(req, res, activeSessions.get(readOfferBearerToken(req)), respondRealtimeOffer);\n\t\t\treturn true;\n\t\t}\n' + anchor);
    return once(text, '\t\t\t\tactive.echoRecap = bridge.echoRecap;', '\t\t\t\tactive.echoRecap = bridge.echoRecap;\n\t\t\t\tactive.echoAttachmentContext = bridge.echoAttachmentContext;');
  });
  return outputs;
}
if (require.main === module) {
  const outputs = patches();
  if (process.argv.includes('--check')) console.log(JSON.stringify({ checked: outputs.map(p => path.basename(p.file)), writes: 0 }));
  else {
    const backup = path.join(process.env.HOME, '.openclaw/backups/echo-attachment-context-' + new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    for (const p of outputs) fs.writeFileSync(path.join(backup, path.basename(p.file)), p.old, { mode: 0o600, flag: 'wx' });
    for (const p of outputs) fs.writeFileSync(p.file, p.next);
    fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(outputs.map(p => ({ file: p.file, sha256: crypto.createHash('sha256').update(p.next).digest('hex') })), null, 2));
    console.log(JSON.stringify({ backup, changed: outputs.length, restartRequired: !!outputs.length }));
  }
}
module.exports = { patches };
