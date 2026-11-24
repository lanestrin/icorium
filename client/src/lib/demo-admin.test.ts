import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, AdminAction, Invitation } from './admin';
import { DEMO_ADMIN_DATA_KEY, DEMO_SESSION_KEY, DEMO_STORAGE_MESSAGE } from './demo';
import { DEMO_LIMIT_MESSAGE, DEMO_YOU_ID, demoAdmin, MAX_DEMO_INVITATIONS } from './demo-admin';

const S = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-11-24T12:00:00Z');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (request: AdminAction, session = S) => demoAdmin<any>(request, session, NOW);
const list = () => (run({ action: 'list' }) as { data: { accounts: Account[]; invitations: Invitation[] } }).data;
const invitation = (email: string) => list().invitations.find((i) => i.email === email) as Invitation;

beforeEach(() => sessionStorage.setItem(DEMO_SESSION_KEY, S)); // the tab's demo, as the Admin page runs in one
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

  it('keeps changes for this session, and starts again for a new demo', () => {
    run({ action: 'revoke', id: 'demo-inv-1' });
    expect(invitation('lee.park@demo.example').state).toBe('revoked');
    sessionStorage.setItem(DEMO_SESSION_KEY, OTHER); // a new demo in this tab
    const fresh = (run({ action: 'list' }, OTHER) as { data: { invitations: Invitation[] } }).data;
    expect(fresh.invitations.find((i) => i.email === 'lee.park@demo.example')?.state).toBe('pending');
  });

  it('keeps the fictional dates fixed from the first read, so later reads do not move them', () => {
    const first = demoAdmin<{ accounts: Account[] }>({ action: 'list' }, S, NOW).ok && sessionStorage.getItem(DEMO_ADMIN_DATA_KEY);
    expect(first).toBeTruthy(); // saved at once
    const later = demoAdmin<{ accounts: Account[] }>({ action: 'list' }, S, NOW + 5 * 86_400_000);
    expect(JSON.stringify(later.ok && later.data.accounts.map((a) => a.created_at))).toBe(JSON.stringify(JSON.parse(first as string).accounts.map((a: Account) => a.created_at)));
  });

  it('still lists when the browser refuses the first save, and reports it on the next change', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(run({ action: 'list' })).toMatchObject({ ok: true });
    expect(run({ action: 'revoke', id: 'demo-inv-1' })).toMatchObject({ ok: false, code: 'storage' });
  });

  it('lists accounts oldest first and invitations newest first', () => {
    list();
    const stored = JSON.parse(sessionStorage.getItem(DEMO_ADMIN_DATA_KEY) as string);
    stored.accounts.reverse(); // saved out of order, so only sorting can put them right
    sessionStorage.setItem(DEMO_ADMIN_DATA_KEY, JSON.stringify(stored));
    const { accounts, invitations } = list();
    const times = (rows: { created_at: string }[]) => rows.map((r) => Date.parse(r.created_at));
    expect(times(accounts)).toEqual([...times(accounts)].sort((a, b) => a - b));
    expect(times(invitations)).toEqual([...times(invitations)].sort((a, b) => b - a));
  });

  it('gives a new invitation 30 days', () => {
    expect(run({ action: 'invite', email: 'fresh@demo.example', role: 'Member' })).toMatchObject({ ok: true, data: { expires_at: new Date(NOW + 30 * 86_400_000).toISOString() } });
  });

  it('does nothing once the demo has ended: every action is refused and nothing is written back', () => {
    list();
    sessionStorage.removeItem(DEMO_ADMIN_DATA_KEY);
    sessionStorage.removeItem(DEMO_SESSION_KEY); // sign-out has dropped the session while it deletes the files
    const requests: AdminAction[] = [
      { action: 'list' }, { action: 'invite', email: 'late@demo.example', role: 'Member' }, { action: 'resend', id: 'demo-inv-1' },
      { action: 'extend', id: 'demo-inv-2' }, { action: 'revoke', id: 'demo-inv-1' },
      { action: 'setRole', userId: 'demo-noah', role: 'Admin' }, { action: 'deactivate', userId: 'demo-noah' }, { action: 'reactivate', userId: 'demo-priya' },
    ];
    for (const request of requests) expect(run(request), request.action).toMatchObject({ ok: false, code: 'not_admin' });
    expect(sessionStorage.getItem(DEMO_ADMIN_DATA_KEY)).toBeNull();
  });

  it.each([
    'not json',
    '{}',
    JSON.stringify({ sessionId: S, accounts: 'x', invitations: [] }),
    JSON.stringify({ sessionId: S, accounts: [{ user_id: 'x', role: 'Root' }], invitations: [] }),
    'DAMAGED_DATES',
  ])('starts again from fresh data when the stored data is %s', (stored: string) => {
    if (stored === 'DAMAGED_DATES') {
      list(); // saves fresh data
      const data = JSON.parse(sessionStorage.getItem(DEMO_ADMIN_DATA_KEY) as string);
      data.invitations[0].expires_at = 'tomorrow';
      stored = JSON.stringify(data);
    }
    sessionStorage.setItem(DEMO_ADMIN_DATA_KEY, stored);
    const restored = list();
    expect(restored.accounts.map((a) => a.user_id)).toContain(DEMO_YOU_ID);
    expect(restored.invitations.find((i) => i.id === 'demo-inv-1')?.expires_at).toBe(new Date(NOW + 25 * 86_400_000).toISOString());
    expect(run({ action: 'list' })).toMatchObject({ ok: true });
  });

  it('reports a failed save with the demo storage message instead of success', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    expect(run({ action: 'revoke', id: 'demo-inv-1' })).toEqual({ ok: false, code: 'storage', message: DEMO_STORAGE_MESSAGE });
    expect(run({ action: 'invite', email: 'x@demo.example', role: 'Member' })).toEqual({ ok: false, code: 'storage', message: DEMO_STORAGE_MESSAGE });
  });

  it('holds at most 50 invitations', () => {
    for (let i = list().invitations.length; i < MAX_DEMO_INVITATIONS; i++) expect(run({ action: 'invite', email: `p${i}@demo.example`, role: 'Member' })).toMatchObject({ ok: true });
    expect(run({ action: 'invite', email: 'one.more@demo.example', role: 'Member' })).toEqual({ ok: false, code: 'demo_limit', message: DEMO_LIMIT_MESSAGE });
    expect(DEMO_LIMIT_MESSAGE).toBe('This demo holds up to 50 invitations. To start over, sign out and start the Admin demo again.');
  });
});
