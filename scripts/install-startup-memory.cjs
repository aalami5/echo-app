// Reversible, version-checked local gateway integration. No config/secret edits.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const dist = '/opt/homebrew/lib/node_modules/openclaw/dist';
const file = path.join(dist, 'talk-DLn5zMng.mjs');
const marker = '// Echo startup-memory v1';
const old = fs.readFileSync(file, 'utf8');
if (old.includes(marker)) { console.log('Startup-memory integration already installed'); process.exit(0); }
const needle = 'const bootstrapContext = await resolveRealtimeBootstrapContextInstructions(params);\n\treturn [params.configuredInstructions, bootstrapContext]';
if (!old.includes(needle)) throw Error('Gateway version changed; inspect and port integration before installing');
const modulePath = path.resolve(__dirname, '../gateway/startup-memory.mjs');
const replacement = `const bootstrapContext = await resolveRealtimeBootstrapContextInstructions(params);
\t${marker}
\tlet startup;
\tif (params.startupGateway && params.startupClient) {
\t\ttry {
\t\t\tconst { prepareStartupMemory } = await import(${JSON.stringify(modulePath)});
\t\t\tconst { r: dispatch } = await import('./server-methods-v1T0byyX.mjs');
\t\t\tstartup = await prepareStartupMemory({
\t\t\t\tsessionKey: params.sessionKey, agentId: params.agentId,
\t\t\t\tworkspace: resolveAgentWorkspaceDir(params.config, params.agentId),
\t\t\t\tcall: (method, requestParams) => new Promise((resolve, reject) => {
\t\t\t\t\tif (!['sessions.list','chat.history','tasks.list','artifacts.list','memory.search'].includes(method)) return reject(new Error('Read-only startup method required'));
\t\t\t\t\tdispatch({ req: { type: 'req', id: randomUUID(), method, params: requestParams }, client: params.startupClient,
\t\t\t\t\t\tcontext: params.startupGateway, isWebchatConnect: () => false,
\t\t\t\t\t\trespond: (ok, payload, error) => ok ? resolve(payload) : reject(new Error(error?.message || 'Unavailable'))
\t\t\t\t\t}).catch(reject);
\t\t\t\t})
\t\t\t});
\t\t\tif (startup) params.startupGateway.logGateway.info('Echo startup memory ' + JSON.stringify(startup.metadata));
\t\t} catch {
\t\t\tstartup = { instructions: 'Startup memory unavailable. Before answering about prior work, use agent_consult to retrieve it. Do not guess or claim background work is running.' };
\t\t\tparams.warn?.('startup memory unavailable');
\t\t}
\t}
\treturn [params.configuredInstructions, bootstrapContext, startup?.instructions]`;
let next = old.replace(needle, replacement);
const callsite = /configuredInstructions: realtimeConfig\.instructions,\n(\s*)sessionKey: target\.canonicalKey,/g;
let count = 0;
next = next.replace(callsite, (_, space) => { count++; return `configuredInstructions: realtimeConfig.instructions,\n${space}startupGateway: context, startupClient: client,\n${space}sessionKey: target.canonicalKey,`; });
if (count !== 2) throw Error('Expected browser and relay call sites');
const backup = path.join(process.env.HOME, '.openclaw/backups/echo-startup-memory-20261021');
fs.mkdirSync(backup, {recursive:true, mode:0o700});
fs.writeFileSync(path.join(backup, path.basename(file)), old, {mode:0o600,flag:'wx'});
fs.writeFileSync(file, next);
console.log(JSON.stringify({file, backup, sha256:crypto.createHash('sha256').update(next).digest('hex'), callsites:count}));
