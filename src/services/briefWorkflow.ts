import { BRIEF_KEY, BriefSettings, Rpc, briefDefinition } from './approvalProtocol';

export async function listBriefs(rpc: Rpc): Promise<any[]> {
  const jobs: any[] = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const page = await rpc.request('cron.list', { includeDisabled: true, limit: 200, offset, includeDeliveryPreviews: false });
    if (!Array.isArray(page.jobs)) throw new Error('Cannot verify existing schedules. Nothing changed.');
    jobs.push(...page.jobs);
    if (!page.hasMore && page.jobs.length < 200) return jobs.filter(j => j.declarationKey === BRIEF_KEY || /morning.*brief|daily.*gmail|daily.*email/i.test(j.name || ''));
  }
  throw new Error('Schedule coverage is incomplete. Review existing briefs in the dashboard first.');
}

// Only explicit user taps call mutation methods. Never called by polling or model text.
export class BriefActions {
  private busy = false;
  constructor(private rpc: Rpc) {}
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('A schedule change is already in progress.');
    this.busy = true;
    try { return await fn(); } finally { this.busy = false; }
  }
  create(settings: BriefSettings) {
    return this.exclusive(async () => {
      const definition = briefDefinition(settings);
      const existing = await listBriefs(this.rpc);
      if (existing.length) throw new Error('A morning brief already exists. Manage it below instead of creating a duplicate.');
      // Stable declaration key is the server-side retry identity. Do not retry a timed-out mutation.
      const result = await this.rpc.request('cron.add', definition);
      const job = result.job || result;
      const verified = await listBriefs(this.rpc);
      const found = verified.find(j => j.id === job.id && j.declarationKey === BRIEF_KEY);
      if (!found) throw new Error('Schedule not confirmed. Refresh; do not create another.');
      return found;
    });
  }
  setEnabled(displayed: any, enabled: boolean) {
    return this.exclusive(async () => {
      const current = (await listBriefs(this.rpc)).find(j => j.id === displayed.id);
      if (!current || !current.configRevision || current.configRevision !== displayed.configRevision) throw new Error('Schedule changed. Refresh before continuing.');
      await this.rpc.request('cron.update', { id: current.id, expectedConfigRevision: current.configRevision, patch: { enabled } });
      const verified = (await listBriefs(this.rpc)).find(j => j.id === current.id);
      if (verified?.enabled !== enabled) throw new Error('Change not confirmed. Refresh status.');
      return verified;
    });
  }
  revoke(grantId: string) {
    return this.exclusive(async () => {
      await this.rpc.request('exec.approval.grants.revoke', { grantId });
      const { grants } = await this.rpc.request('exec.approval.grants.list', { limit: 500 });
      if (!grants?.some((g: any) => g.grantId === grantId && g.revokedAtMs !== null)) throw new Error('Revocation not confirmed. Refresh status.');
    });
  }
}
