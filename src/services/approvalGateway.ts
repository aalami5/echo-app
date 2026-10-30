import { Platform } from 'react-native';
import { loadApprovalIdentity } from './approvalIdentity';
export function devicePayload(p: { id: string; client: string; scopes: string[]; ts: number; token: string; nonce: string; platform: string }) {
  return ['v3', p.id, p.client, 'ui', 'operator', p.scopes.join(','), String(p.ts), p.token, p.nonce, p.platform.toLowerCase(), ''].join('|');
}
export class ApprovalGateway {
  private socket?: WebSocket;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private generation = 0;
  private cancelConnect?: () => void;
  deviceId = '';
  scopes: string[] = []; methods: string[] = [];
  ready = false;
  onChange = () => {};
  constructor(private url: string, private token: string, private ownerId: string) {}
  async connect(manageSchedule = false) {
    if (!this.ownerId) throw new Error('Sign in to Echo before pairing an approval device.');
    const url = new URL(this.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS gateway URL.');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Approvals require HTTPS.');
    this.close();
    const generation = this.generation;
    const identity = await loadApprovalIdentity(`${url.origin}|${this.ownerId}`);
    if (generation !== this.generation) throw new Error('Approval connection cancelled.');
    this.deviceId = identity.id;
    const scopes = manageSchedule ? ['operator.read', 'operator.approvals', 'operator.admin'] : ['operator.read', 'operator.approvals'];
    const socket = new WebSocket(this.url.replace(/^http/, 'ws'));
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      this.cancelConnect = () => reject(new Error('Approval connection cancelled.'));
      let handshakeStarted = false;
      const timeout = setTimeout(() => { reject(new Error('Approval connection timed out. Check device pairing in the dashboard.')); socket.close(); }, 15000);
      socket.onmessage = async event => {
        if (socket !== this.socket) return;
        let frame: any; try { frame = JSON.parse(String(event.data)); } catch { return; }
        if (frame.event === 'connect.challenge' && !handshakeStarted) {
          handshakeStarted = true;
          try {
            const { nonce, ts } = frame.payload || {};
            if (typeof nonce !== 'string' || !nonce || !Number.isSafeInteger(ts) || ts < 0) throw new Error('Invalid gateway challenge.');
            const platform = Platform.OS, client = platform === 'ios' ? 'openclaw-ios' : platform === 'android' ? 'openclaw-android' : 'webchat-ui';
            const signature = await identity.sign(devicePayload({ id: identity.id, client, scopes, ts, token: this.token, nonce, platform }));
            if (socket !== this.socket || socket.readyState !== WebSocket.OPEN) return;
            socket.send(JSON.stringify({ type: 'req', id: 'hello', method: 'connect', params: {
              minProtocol: 4, maxProtocol: 4, client: { id: client, version: 'echo-approvals-1', platform, mode: 'ui', displayName: 'Echo owner approvals' },
              role: 'operator', scopes, caps: ['approvals'], auth: { token: this.token },
              device: { id: identity.id, publicKey: identity.publicKey, signature, signedAt: ts, nonce },
            } }));
          } catch (error) { clearTimeout(timeout); reject(error); socket.close(); }
        } else if (frame.type === 'res' && frame.id === 'hello') {
          clearTimeout(timeout);
          if (!frame.ok) {
            const message = frame.error?.message || 'Approve this Echo device in the trusted dashboard, then reconnect.';
            reject(new Error(/pairing required/i.test(message)
              ? 'Pairing required. Open your trusted OpenClaw dashboard → Devices, review Echo owner approvals matching the device ID below, then reconnect here.'
              : message));
            socket.close(); return;
          }
          this.scopes = frame.payload?.auth?.scopes || []; this.methods = frame.payload?.features?.methods || [];
          if (!this.scopes.includes('operator.approvals') || !this.methods.includes('approval.resolve')) {
            reject(new Error('This device does not have approval authority. Pair it in the trusted dashboard.')); socket.close(); return;
          }
          this.cancelConnect = undefined;
          this.ready = true; resolve(); this.onChange();
        } else if (frame.type === 'res') {
          const p = this.pending.get(frame.id); if (!p) return;
          clearTimeout(p.timer); this.pending.delete(frame.id);
          frame.ok ? p.resolve(frame.payload) : p.reject(new Error(frame.error?.message || 'Gateway rejected this operation.'));
        } else if (frame.type === 'event' && /approval\.(requested|resolved)$/.test(frame.event)) this.onChange();
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        if (socket !== this.socket) return;
        const wasReady = this.ready;
        this.ready = false;
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Connection lost. Refresh status before trying again.')); }
        this.pending.clear(); reject(new Error('Approval connection closed.'));
        // A rejected handshake already supplies its specific error. A later close
        // must not overwrite pairing/auth guidance with a generic disconnect.
        if (wasReady) this.onChange();
      };
      socket.onerror = () => { clearTimeout(timeout); reject(new Error('Approval connection unavailable.')); socket.close(); };
    });
  }
  request<T = any>(method: string, params: any): Promise<T> {
    if (!this.ready || !this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Connect your paired approval device first.'));
    if (!this.methods.includes(method)) return Promise.reject(new Error(`Gateway does not support ${method}.`));
    return new Promise((resolve, reject) => {
      const id = `owner-${++this.sequence}`;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Acknowledgement timed out. Refresh status; do not repeat the action.')); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket!.send(JSON.stringify({ type: 'req', id, method, params })); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new Error('Connection unavailable.')); }
    });
  }
  close() {
    this.generation++;
    this.cancelConnect?.(); this.cancelConnect = undefined;
    this.ready = false; this.scopes = []; this.methods = [];
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Approval connection closed. Check status before retrying.')); }
    this.pending.clear(); const socket = this.socket; this.socket = undefined; socket?.close();
  }
}
