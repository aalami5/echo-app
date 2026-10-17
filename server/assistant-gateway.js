'use strict';
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

// Server-only persistent RPC transport. Never expose operator credentials or an
// arbitrary RPC endpoint to the phone. Reconnect does not resubmit mutations.
class AssistantGateway extends EventEmitter {
  constructor({ url, token, WebSocketImpl = globalThis.WebSocket }) {
    super(); this.url = url.replace(/^http/, 'ws'); this.token = token;
    this.WebSocketImpl = WebSocketImpl; this.pending = new Map(); this.generation = 0;
  }
  async connect() {
    if (this.ready) return;
    if (this.connecting) return this.connecting;
    if (!this.token) throw new Error('Assistant authentication is not configured');
    this.connecting = new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(this.url); this.socket = socket;
      const timer = setTimeout(() => { socket.close(); reject(new Error('Assistant connection timed out')); }, 12000);
      let helloId;
      socket.onmessage = e => {
        let m; try { m = JSON.parse(String(e.data)); } catch { return; }
        if (m.event === 'connect.challenge') {
          helloId = randomUUID();
          socket.send(JSON.stringify({ type: 'req', id: helloId, method: 'connect', params: {
            minProtocol: 4, maxProtocol: 4,
            client: { id: 'gateway-client', version: 'echo-live-voice-1', platform: 'node', mode: 'backend', displayName: 'Echo personal assistant' },
            role: 'operator', scopes: ['operator.read', 'operator.write', 'operator.talk'], auth: { token: this.token },
          }}));
        } else if (m.id === helloId && m.type === 'res') {
          clearTimeout(timer);
          if (!m.ok) { reject(new Error(m.error?.message || 'Assistant connection rejected')); socket.close(); return; }
          this.ready = true; this.generation++; this.emit('connected', this.generation); resolve();
        } else if (m.type === 'res') {
          const p = this.pending.get(m.id); if (!p) return;
          this.pending.delete(m.id); clearTimeout(p.timer);
          if (m.ok) p.resolve(m.payload);
          else { const err = new Error(m.error?.message || 'Assistant request failed'); err.code = m.error?.code; err.details = m.error?.details; p.reject(err); }
        } else if (m.type === 'event') this.emit('event', m);
      };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Assistant connection unavailable')); };
      socket.onclose = () => {
        clearTimeout(timer); this.ready = false; this.connecting = null;
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Connection lost; check status before retrying')); }
        this.pending.clear(); reject(new Error('Assistant disconnected')); this.emit('disconnected');
      };
    });
    try { await this.connecting; } catch (e) { this.connecting = null; throw e; }
  }
  async call(method, params = {}, timeoutMs = 30000) {
    await this.connect();
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Request acknowledgement timed out; state may have changed')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ type: 'req', id, method, params })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  close() { this.socket?.close(); }
}
module.exports = { AssistantGateway };
