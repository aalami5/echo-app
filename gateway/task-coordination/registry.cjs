'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const OWNER_DM = 'agent:main:whatsapp:direct:+16503153236';
const allowed = key => key === OWNER_DM || key === 'agent:main:main' || /^agent:main:echo-app:(home|echo|noharm|expenses|woodside|superchill|[a-f0-9-]{36})$/.test(key || '');
const digest = value => createHash('sha256').update(value).digest('hex');
const clean = (s, n = 2000) => String(s || '').replace(/[\x00-\x08\x0b-\x1f]/g, '').slice(0, n);
const terminal = new Set(['completed', 'failed', 'cancelled']);
class Registry {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file); fs.chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, task_key TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks(resource TEXT PRIMARY KEY, task_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS actions(action_key TEXT PRIMARY KEY, task_id TEXT NOT NULL, state TEXT NOT NULL, evidence TEXT);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL);`);
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  get(id) { const row = this.db.prepare('SELECT data FROM tasks WHERE id=?').get(id); if (!row) throw Error('Task not found'); return JSON.parse(row.data); }
  save(t, kind) { t.updatedAt = Date.now(); t.revision = (t.revision || 0) + 1; this.db.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(t), t.id); this.db.prepare('INSERT INTO events(task_id,at,kind) VALUES(?,?,?)').run(t.id, t.updatedAt, kind); return t; }
  list() { return this.db.prepare('SELECT data FROM tasks ORDER BY rowid DESC LIMIT 200').all().map(r => JSON.parse(r.data)).sort((a,b) => b.updatedAt-a.updatedAt); }
  begin({key,title,goal,resources=[],project='home'}, ctx) {
    if (!allowed(ctx.sessionKey)) throw Error('Private owner context required');
    if (!ctx.runId || !key || !title || key.length > 300 || resources.length > 12) throw Error('Task key, short title and bounded resources required');
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT data FROM tasks WHERE task_key=?').get(key);
      if (existing) { const t = JSON.parse(existing.data); if (!t.sources.includes(ctx.sessionKey)) {t.sources.push(ctx.sessionKey); this.save(t,'linked');} return {task:t,reused:true,canExecute: t.runId===ctx.runId && t.status==='running'}; }
      const now=Date.now(); const t={id:randomUUID(),key,title:clean(title,100),goal:clean(goal),project:clean(project,60),status:'queued',sources:[ctx.sessionKey],ownerSession:ctx.sessionKey,runId:ctx.runId,resources:[...new Set(resources.map(r=>clean(r,180)))],createdAt:now,updatedAt:now,revision:0,summary:'',nextStep:'',evidence:[],notes:[]};
      this.db.prepare('INSERT INTO tasks(id,task_key,data) VALUES(?,?,?)').run(t.id,key,JSON.stringify(t));
      const conflict=t.resources.map(r=>this.db.prepare('SELECT task_id FROM locks WHERE resource=?').get(r)).find(Boolean);
      if(conflict){t.status='waiting';t.nextStep=`Waiting for task ${conflict.task_id}`;}
      else {for(const r of t.resources)this.db.prepare('INSERT INTO locks VALUES(?,?)').run(r,t.id);t.status='running';}
      return {task:this.save(t,'created'),reused:false,canExecute:t.status==='running'};
    });
  }
  update(id, patch, ctx) {
    if(!allowed(ctx.sessionKey))throw Error('Private owner context required');
    return this.transaction(()=>{
      const t=this.get(id);
      if(patch.revision!==t.revision)throw Error('Task changed; refresh before updating');
      if(t.ownerSession!==ctx.sessionKey || t.runId!==ctx.runId)throw Error('Task belongs to another execution; add a note instead');
      if(terminal.has(t.status))throw Error('Completed history is immutable; create a new task for new work');
      const status=patch.status || t.status;
      if(!['queued','running','waiting','needs_review','completed','failed','cancelled'].includes(status))throw Error('Invalid status');
      if(status==='completed' && this.db.prepare("SELECT count(*) AS n FROM actions WHERE task_id=? AND state!='verified'").get(id).n)throw Error('Verify uncertain action receipts before completing this task');
      if(status==='completed' && (!Array.isArray(patch.evidence)||!patch.evidence.length))throw Error('Verified result evidence is required');
      if(status==='running')for(const r of t.resources){const lock=this.db.prepare('SELECT task_id FROM locks WHERE resource=?').get(r);if(lock&&lock.task_id!==id)throw Error('Resource is owned by another task');this.db.prepare('INSERT OR IGNORE INTO locks VALUES(?,?)').run(r,id);}
      t.status=status;
      for(const field of ['summary','nextStep'])if(patch[field]!==undefined)t[field]=clean(patch[field]);
      if(patch.evidence)t.evidence=patch.evidence.slice(0,10).map(x=>clean(x,1000));
      if(terminal.has(status))this.db.prepare('DELETE FROM locks WHERE task_id=?').run(id);
      return this.save(t,'updated');
    });
  }
  resume(id,revision,resolution,ctx){if(!allowed(ctx.sessionKey)||!ctx.runId||!resolution)throw Error('Verified reconciliation note required');return this.transaction(()=>{const t=this.get(id);if(t.revision!==revision||!['needs_review','waiting','queued'].includes(t.status))throw Error('Refresh task; only paused tasks may be resumed');for(const r of t.resources){const lock=this.db.prepare('SELECT task_id FROM locks WHERE resource=?').get(r);if(lock&&lock.task_id!==id)throw Error('Resource still busy');this.db.prepare('INSERT OR IGNORE INTO locks VALUES(?,?)').run(r,id);}t.ownerSession=ctx.sessionKey;t.runId=ctx.runId;t.status='running';t.notes.push({at:Date.now(),source:ctx.sessionKey,text:clean(resolution)});return this.save(t,'resumed');});}
  note(id,text,ctx){if(!allowed(ctx.sessionKey))throw Error('Private owner context required');return this.transaction(()=>{const t=this.get(id);t.notes.push({at:Date.now(),source:ctx.sessionKey,text:clean(text)});t.notes=t.notes.slice(-40);if(!t.sources.includes(ctx.sessionKey))t.sources.push(ctx.sessionKey);return this.save(t,'note');});}
  action(id,key,ctx){return this.transaction(()=>{const t=this.get(id);if(!allowed(ctx.sessionKey)||t.ownerSession!==ctx.sessionKey||t.runId!==ctx.runId||t.status!=='running')throw Error('Claim a running task before executing');const old=this.db.prepare('SELECT * FROM actions WHERE action_key=?').get(key);if(old)throw Error(`Action already ${old.state}; verify existing outcome, do not repeat`);this.db.prepare('INSERT INTO actions VALUES(?,?,?,NULL)').run(key,id,'uncertain');return {prepared:true,actionKey:key};});}
  verify(id,key,evidence,ctx){return this.transaction(()=>{const t=this.get(id);if(!allowed(ctx.sessionKey)||t.ownerSession!==ctx.sessionKey||t.runId!==ctx.runId||!evidence)throw Error('Owner execution and evidence required');const r=this.db.prepare("UPDATE actions SET state='verified',evidence=? WHERE action_key=? AND task_id=?").run(clean(evidence),key,id);if(!r.changes)throw Error('Action not found');return {verified:true};});}
  endRun(ctx){if(!allowed(ctx.sessionKey))return;this.transaction(()=>{for(const t of this.list())if(t.runId===ctx.runId&&t.ownerSession===ctx.sessionKey&&t.status==='running'){t.status='needs_review';t.nextStep='Execution ended without a verified completion. Check results before continuing.';this.save(t,'run-ended');}});}
  interruptAll(){this.transaction(()=>{for(const t of this.list())if(t.status==='running'){t.status='needs_review';t.nextStep='Gateway restarted; verify existing outcomes before resuming.';this.save(t,'restart');}});}
  actions(id){return this.db.prepare('SELECT action_key AS actionKey,state,evidence FROM actions WHERE task_id=?').all(id);}
  close(){this.db.close();}
}
module.exports={Registry,allowed,digest};
