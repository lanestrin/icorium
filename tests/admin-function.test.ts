// The Admin Edge Function's request logic (build-plan 17.3), run with fake services. This proves the
// handler's rules; the real SMTP send, the ban and the SQL run only on a hosted project (17.7).
import { describe, expect, it, vi } from 'vitest';
import { handleAdminRequest, invitationEmail, type Deps, type RpcResult } from '../supabase/functions/admin/handler';

const SITE = 'https://reclaim.example.app';
const ACTOR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const INVITATION = { id: '33333333-3333-4333-8333-333333333333', email: 'new@example.com', role: 'Member', expires_at: '2026-12-22T10:00:00Z' };

type Options = { rpc?: (name: string, args: Record<string, unknown>) => Promise<RpcResult>; sendEmail?: Deps['sendEmail']; setBan?: Deps['setBan']; verify?: Deps['verifyToken'] };

function setup(options: Options = {}) {
  const deps = {
    siteUrl: SITE,
    verifyToken: vi.fn(options.verify ?? (async (token: string) => (token === 'good' ? ACTOR : null))),
    rpc: vi.fn(options.rpc ?? (async () => ({ data: INVITATION, error: null }))),
    setBan: vi.fn(options.setBan ?? (async () => true)),
    sendEmail: vi.fn(options.sendEmail ?? (async () => {})),
  };
  async function post(body: unknown, init: { token?: string | null; method?: string; raw?: string } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (init.token !== null) headers.Authorization = `Bearer ${init.token ?? 'good'}`;
    const request = new Request('https://x.supabase.co/functions/v1/admin', {
      method: init.method ?? 'POST',
      headers,
      body: init.method === 'GET' ? undefined : (init.raw ?? JSON.stringify(body)),
    });
    const response = await handleAdminRequest(request, deps);
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, json: text ? JSON.parse(text) : null };
  }
  return { deps, post };
}

const sqlError = (message: string) => async (): Promise<RpcResult> => ({ data: null, error: { message } });

describe('admin function: who may call', () => {
  it('rejects a missing or invalid token without any side effect', async () => {
    const { deps, post } = setup();
    expect((await post({ action: 'list' }, { token: null })).status).toBe(401);
    expect((await post({ action: 'list' }, { token: 'bad' })).status).toBe(401);
    expect(deps.rpc).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.setBan).not.toHaveBeenCalled();
  });

  it('treats a throwing token check as unauthorized', async () => {
    const { deps, post } = setup({ verify: async () => { throw new Error('down'); } });
    expect((await post({ action: 'list' })).status).toBe(401);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('uses the verified user as the actor and ignores any actor in the body', async () => {
    const { deps, post } = setup();
    await post({ action: 'invite', email: 'new@example.com', actor: TARGET, userId: TARGET });
    expect(deps.rpc).toHaveBeenCalledWith('admin_create_invitation', { target_email: 'new@example.com', target_role: 'Member', actor: ACTOR });
  });

  it('returns 403 not_admin with no send or ban', async () => {
    const { deps, post } = setup({ rpc: sqlError('not_admin') });
    for (const body of [{ action: 'invite', email: 'a@b.co' }, { action: 'deactivate', userId: TARGET }, { action: 'list' }]) {
      const result = await post(body);
      expect(result.status).toBe(403);
      expect(result.json).toEqual({ error: 'not_admin' });
    }
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.setBan).not.toHaveBeenCalled();
  });
});

describe('admin function: request shape', () => {
  it('answers a preflight for the site origin only', async () => {
    const { deps } = setup();
    const response = await handleAdminRequest(new Request('https://x.supabase.co/functions/v1/admin', { method: 'OPTIONS', headers: { Origin: SITE } }), deps);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
  });

  it('refuses other methods', async () => {
    const { post } = setup();
    expect((await post(null, { method: 'GET' })).status).toBe(405);
  });

  it.each([
    ['an unknown action', { action: 'delete-everything' }],
    ['no action', {}],
    ['an invite without an email', { action: 'invite' }],
    ['an invite with a non-text role', { action: 'invite', email: 'a@b.co', role: 5 }],
    ['an extend without a valid id', { action: 'extend', id: 'not-a-uuid' }],
    ['a revoke with an injected id', { action: 'revoke', id: `${INVITATION.id}' or '1'='1` }],
    ['a role change without a user', { action: 'setRole', role: 'Admin' }],
    ['a deactivation with a bad user', { action: 'deactivate', userId: '1' }],
  ])('returns 400 for %s', async (_label, body) => {
    const { deps, post } = setup();
    expect((await post(body)).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('returns 400 for a body that is not a JSON object, or is too large', async () => {
    const { post } = setup();
    expect((await post(null, { raw: 'nope' })).status).toBe(400);
    expect((await post(null, { raw: '[]' })).status).toBe(400);
    expect((await post(null, { raw: JSON.stringify({ action: 'list', pad: 'x'.repeat(5000) }) })).status).toBe(400);
  });

  it('passes SQL validation failures on as 400', async () => {
    const { post } = setup({ rpc: sqlError('invalid_email') });
    const result = await post({ action: 'invite', email: 'a@b.co, c@d.co' });
    expect(result.status).toBe(400);
    expect(result.json).toEqual({ error: 'invalid_email' });
  });

  it('never repeats an unknown database error', async () => {
    const { post } = setup({ rpc: sqlError('relation "public.profiles" does not exist (secret detail)') });
    const result = await post({ action: 'list' });
    expect(result.status).toBe(500);
    expect(result.text).not.toContain('secret detail');
    expect(result.json).toEqual({ error: 'server_error' });
  });
});

describe('admin function: invitations', () => {
  it('creates the invitation, then sends the link and the expiry', async () => {
    const { deps, post } = setup();
    const result = await post({ action: 'invite', email: 'new@example.com', role: 'Admin' });
    expect(result.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith('admin_create_invitation', { target_email: 'new@example.com', target_role: 'Admin', actor: ACTOR });
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    const message = deps.sendEmail.mock.calls[0][0];
    expect(message.to).toBe('new@example.com');
    expect(message.text).toContain(`${SITE}/activate?email=new%40example.com`);
    expect(message.text).toContain('2026-12-22');
  });

  it('discards the invitation and reports failure when the first send fails', async () => {
    const { deps, post } = setup({ sendEmail: async () => { throw new Error('smtp password wrong'); } });
    const result = await post({ action: 'invite', email: 'new@example.com' });
    expect(result.status).toBe(502);
    expect(result.json).toEqual({ error: 'email_failed' });
    expect(result.text).not.toContain('smtp');
    expect(result.text).not.toContain('sent');
    expect(deps.rpc).toHaveBeenLastCalledWith('admin_discard_unsent_invitation', { target_id: INVITATION.id, actor: ACTOR });
  });

  it('reports email_failed_pending when the discard after a failed first send also fails', async () => {
    const { deps, post } = setup({
      rpc: async (name) => (name === 'admin_discard_unsent_invitation' ? { data: null, error: { message: 'connection reset (detail)' } } : { data: INVITATION, error: null }),
      sendEmail: async () => { throw new Error('down'); },
    });
    const result = await post({ action: 'invite', email: 'new@example.com' });
    expect(result.status).toBe(502);
    expect(result.json).toEqual({ error: 'email_failed_pending' });
    expect(result.text).not.toContain('detail');
    expect(deps.rpc.mock.calls.map(([name]) => name)).toEqual(['admin_create_invitation', 'admin_discard_unsent_invitation']);
  });

  it('keeps the invitation when a resend fails', async () => {
    const { deps, post } = setup({ sendEmail: async () => { throw new Error('down'); } });
    const result = await post({ action: 'resend', id: INVITATION.id });
    expect(result.status).toBe(502);
    expect(deps.rpc).toHaveBeenCalledTimes(1);
    expect(deps.rpc).toHaveBeenCalledWith('admin_pending_invitation', { target_id: INVITATION.id, actor: ACTOR });
  });

  it('resends only a pending invitation, without changing its expiry', async () => {
    const closed = setup({ rpc: sqlError('invitation_not_pending') });
    expect((await closed.post({ action: 'resend', id: INVITATION.id })).status).toBe(409);
    expect(closed.deps.sendEmail).not.toHaveBeenCalled();

    const open = setup();
    expect((await open.post({ action: 'resend', id: INVITATION.id })).status).toBe(200);
    expect(open.deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(open.deps.rpc).toHaveBeenCalledTimes(1);
  });

  it('extends and revokes in SQL only, with no email', async () => {
    const { deps, post } = setup();
    expect((await post({ action: 'extend', id: INVITATION.id })).status).toBe(200);
    expect((await post({ action: 'revoke', id: INVITATION.id })).status).toBe(200);
    expect(deps.rpc.mock.calls.map(([name]) => name)).toEqual(['admin_extend_invitation', 'admin_revoke_invitation']);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it('returns 409 for a closed invitation, an existing account or invitation', async () => {
    for (const code of ['invitation_closed', 'account_exists', 'invitation_exists']) {
      const { post } = setup({ rpc: sqlError(code) });
      const result = await post({ action: 'extend', id: INVITATION.id });
      expect(result.status).toBe(409);
      expect(result.json).toEqual({ error: code });
    }
  });
});

describe('admin function: roles and account access', () => {
  it('changes a role in SQL only', async () => {
    const { deps, post } = setup();
    expect((await post({ action: 'setRole', userId: TARGET, role: 'Admin' })).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith('admin_set_role', { target_user: TARGET, target_role: 'Admin', actor: ACTOR });
    expect(deps.setBan).not.toHaveBeenCalled();
  });

  it('deactivates in SQL first, then bans', async () => {
    const order: string[] = [];
    const { deps, post } = setup({
      rpc: async (name) => { order.push(name); return { data: { user_id: TARGET, active: false }, error: null }; },
      setBan: async () => { order.push('ban'); return true; },
    });
    const result = await post({ action: 'deactivate', userId: TARGET });
    expect(result.status).toBe(200);
    expect(order).toEqual(['admin_set_active', 'ban']);
    expect(deps.rpc).toHaveBeenCalledWith('admin_set_active', { target_user: TARGET, target_active: false, actor: ACTOR });
    expect(deps.setBan).toHaveBeenCalledWith(TARGET, true);
  });

  it('reports sessions_not_ended when the ban fails, or throws', async () => {
    for (const setBan of [async () => false, async () => { throw new Error('boom'); }]) {
      const { post } = setup({ setBan });
      const result = await post({ action: 'deactivate', userId: TARGET });
      expect(result.status).toBe(502);
      expect(result.json).toEqual({ error: 'sessions_not_ended' });
    }
  });

  it('reactivates in SQL, then lifts the ban', async () => {
    const { deps, post } = setup();
    expect((await post({ action: 'reactivate', userId: TARGET })).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith('admin_set_active', { target_user: TARGET, target_active: true, actor: ACTOR });
    expect(deps.setBan).toHaveBeenCalledWith(TARGET, false);
  });

  it('reports still_banned when lifting the ban fails', async () => {
    const { post } = setup({ setBan: async () => false });
    const result = await post({ action: 'reactivate', userId: TARGET });
    expect(result.status).toBe(502);
    expect(result.json).toEqual({ error: 'still_banned' });
  });

  it('passes last_admin through and never bans when SQL refuses', async () => {
    const { deps, post } = setup({ rpc: sqlError('last_admin') });
    const result = await post({ action: 'deactivate', userId: ACTOR });
    expect(result.status).toBe(409);
    expect(result.json).toEqual({ error: 'last_admin' });
    expect(deps.setBan).not.toHaveBeenCalled();
    expect((await post({ action: 'setRole', userId: ACTOR, role: 'Member' })).json).toEqual({ error: 'last_admin' });
  });
});

describe('invitation email', () => {
  it('encodes the address in the link and keeps the subject on one line', () => {
    const message = invitationEmail({ ...INVITATION, email: 'a+b&c=d@example.com' }, `${SITE}/`);
    expect(message.text).toContain(`${SITE}/activate?email=a%2Bb%26c%3Dd%40example.com`);
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(message.text).toContain('as a Member');
  });
});
