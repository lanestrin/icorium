import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAction, Invitation } from './admin';
import { DEMO_ADMIN_DATA_KEY } from './demo';
import { DEMO_LIMIT_MESSAGE, DEMO_STORAGE_FAILED_MESSAGE, DEMO_YOU_ID, demoAdmin, demoAdminList, MAX_DEMO_INVITATIONS } from './demo-admin';

const S = 'session-a';
const NOW = Date.parse('2026-11-24T12:00:00Z');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (request: AdminAction, session = S) => demoAdmin<any>(request, session, NOW);
const list = () => demoAdminList(S, NOW);
const invitation = (email: string) => list().invitations.find((i) => i.email === email) as Invitation;

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

describe('the Admin demo backend', () => {
  it('starts with fictional people in every state, and the guest as an active Admin beside another', () => {
    const { accounts, invitations } = list();
    expect(accounts.every((a) => a.email.endsWith('.example'))).toBe(true);
    expect(accounts.find((a) => a.user_id === DEMO_YOU_ID)).toMatchObject({ role: 'Admin', active: true });
    expect(accounts.filter((a) => a.role === 'Admin' && a.active).length).toBeGreaterThanOrEqual(2);
    expect(accounts.some((a) => a.role === 'Member' && !a.active)).toBe(true);
    expect(accounts.some((a) => a.name === null)).toBe(true);
    expect(invitations.map((i) => i.state).sort()).toEqual(['accepted', 'expired', 'pending', 'revoked']);
    expect(accounts.map((a) => a.email)).toContain(invitations.find((i) => i.state === 'accepted')?.email);
    expect(invitations.every((i) => i.email.endsWith('.example'))).toBe(true);
  });

  it('invites with the real rules: cleaned address, role, duplicates and bad addresses', () => {
    const made = run({ action: 'invite', email: '  New.Person@Demo.Example ', role: 'Member' });
    expect(made).toMatchObject({ ok: true, data: { email: 'new.person@demo.example', role: 'Member', state: 'pending' } });
    expect(invitation('new.person@demo.example').state).toBe('pending');
    expect(run({ action: 'invite', email: 'new.person@demo.example', role: 'Member' })).toMatchObject({ ok: false, code: 'invitation_exists' });
    expect(run({ action: 'invite', email: 'lee.park@demo.example', role: 'Member' })).toMatchObject({ ok: false, code: 'invitation_exists' });
    expect(run({ action: 'invite', email: 'old.invite@demo.example', role: 'Member' })).toMatchObject({ ok: false, code: 'invitation_exists' }); // expired is still open
    expect(run({ action: 'invite', email: 'mara.ellis@demo.example', role: 'Member' })).toMatchObject({ ok: false, code: 'account_exists' });
    expect(run({ action: 'invite', email: 'withdrawn@demo.example', role: 'Admin' })).toMatchObject({ ok: true }); // a revoked one may be invited again
    for (const email of ['', 'no-at', 'a b@x.example', 'a@x', 'a,b@x.example', '<a>@x.example', `${'a'.repeat(250)}@x.example`])
      expect(run({ action: 'invite', email, role: 'Member' }), email).toMatchObject({ ok: false, code: 'invalid_email' });
    expect(run({ action: 'invite', email: 'r@x.example', role: 'Owner' as 'Admin' })).toMatchObject({ ok: false, code: 'invalid_role' });
  });

  it('resends only a pending invitation, and sends nothing anywhere', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(run({ action: 'resend', id: 'demo-inv-1' })).toMatchObject({ ok: true, data: { state: 'pending' } });
    for (const id of ['demo-inv-2', 'demo-inv-3', 'demo-inv-4', 'nope'])
      expect(run({ action: 'resend', id }), id).toMatchObject({ ok: false, code: 'invitation_not_pending' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('extends a pending or expired invitation by 30 days, and revokes one, but not a closed one', () => {
    const extended = run({ action: 'extend', id: 'demo-inv-2' });
    expect(extended).toMatchObject({ ok: true, data: { state: 'pending', expires_at: new Date(NOW + 30 * 86_400_000).toISOString() } });
    expect(run({ action: 'revoke', id: 'demo-inv-1' })).toMatchObject({ ok: true, data: { state: 'revoked' } });
    for (const id of ['demo-inv-1', 'demo-inv-3', 'demo-inv-4', 'nope']) {
      expect(run({ action: 'extend', id }), id).toMatchObject({ ok: false, code: 'invitation_closed' });
      expect(run({ action: 'revoke', id }), id).toMatchObject({ ok: false, code: 'invitation_closed' });
    }
  });

  it('changes roles and access, and keeps one active Admin for both demotion and deactivation', () => {
    expect(run({ action: 'setRole', userId: 'demo-noah', role: 'Admin' })).toMatchObject({ ok: true, data: { role: 'Admin' } });
    expect(run({ action: 'deactivate', userId: 'demo-mara' })).toMatchObject({ ok: true, data: { active: false } });
    expect(run({ action: 'reactivate', userId: 'demo-mara' })).toMatchObject({ ok: true, data: { active: true } });
    expect(run({ action: 'setRole', userId: 'demo-mara', role: 'Member' })).toMatchObject({ ok: true });
    expect(run({ action: 'setRole', userId: 'demo-noah', role: 'Member' })).toMatchObject({ ok: true });
    // Only the guest's row is left as an active Admin.
    expect(run({ action: 'setRole', userId: DEMO_YOU_ID, role: 'Member' })).toMatchObject({ ok: false, code: 'last_admin' });
    expect(run({ action: 'deactivate', userId: DEMO_YOU_ID })).toMatchObject({ ok: false, code: 'last_admin' });
    expect(run({ action: 'setRole', userId: 'ghost', role: 'Admin' })).toMatchObject({ ok: false, code: 'account_not_found' });
    expect(run({ action: 'deactivate', userId: 'ghost' })).toMatchObject({ ok: false, code: 'account_not_found' });
    expect(run({ action: 'setRole', userId: 'demo-noah', role: 'Boss' as 'Admin' })).toMatchObject({ ok: false, code: 'invalid_role' });
  });

  it('lets the guest demote their own row once another Admin remains', () => {
    expect(run({ action: 'setRole', userId: DEMO_YOU_ID, role: 'Member' })).toMatchObject({ ok: true, data: { role: 'Member' } });
  });

  it('keeps changes for this session, and replaces them for another', () => {
    run({ action: 'revoke', id: 'demo-inv-1' });
    expect(invitation('lee.park@demo.example').state).toBe('revoked');
    expect(demoAdminList('another-session', NOW).invitations.find((i) => i.email === 'lee.park@demo.example')?.state).toBe('pending');
  });

  it.each([
    'not json',
    '{}',
    '{"sessionId":"session-a","accounts":"x","invitations":[]}',
    JSON.stringify({ sessionId: S, accounts: [{ user_id: 'x', role: 'Root' }], invitations: [] }),
  ])('starts again from fresh data when the stored data is %s', (stored) => {
    sessionStorage.setItem(DEMO_ADMIN_DATA_KEY, stored);
    expect(list().accounts.map((a) => a.user_id)).toContain(DEMO_YOU_ID);
    expect(run({ action: 'list' })).toMatchObject({ ok: true });
  });

  it('reports a failed save instead of success', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(run({ action: 'revoke', id: 'demo-inv-1' })).toEqual({ ok: false, code: 'storage', message: DEMO_STORAGE_FAILED_MESSAGE });
  });

  it('holds at most 50 invitations', () => {
    for (let i = list().invitations.length; i < MAX_DEMO_INVITATIONS; i++) expect(run({ action: 'invite', email: `p${i}@demo.example`, role: 'Member' })).toMatchObject({ ok: true });
    expect(run({ action: 'invite', email: 'one.more@demo.example', role: 'Member' })).toEqual({ ok: false, code: 'demo_limit', message: DEMO_LIMIT_MESSAGE });
  });
});
