// The Admin demo's fictional people and invitations (build-plan 17.10). Everything lives in this tab's sessionStorage,
// tied to the demo's session ID, and goes nowhere: no Supabase call, no Admin function, no email. The rules mirror
// supabase/migrations/20261122000000_admin_access.sql so the page behaves as the real one does.
import { z } from 'zod';
import { adminMessage, NOT_ADMIN_CODE, type AdminAction, type AdminList, type AdminResult, type Invitation, type Role } from './admin';
import { currentDemoId, DEMO_ADMIN_DATA_KEY, DEMO_STORAGE_MESSAGE } from './demo';

/** The fictional account the guest "is". Changing its role or status here never changes the demo's own access. */
export const DEMO_YOU_ID = 'demo-you';
export const MAX_DEMO_INVITATIONS = 50;
export const DEMO_LIMIT_MESSAGE = `This demo holds up to ${MAX_DEMO_INVITATIONS} invitations. To start over, sign out and start the Admin demo again.`;

const DAY = 86_400_000;

const role = z.enum(['Admin', 'Member']);
const date = z.iso.datetime();
const schema = z.object({
  sessionId: z.string(),
  accounts: z.array(z.object({
    user_id: z.string().min(1).max(64), email: z.string().max(254), name: z.string().max(100).nullable(), role, active: z.boolean(), created_at: date,
  })).max(100),
  invitations: z.array(z.object({
    id: z.string().min(1).max(64), email: z.string().max(254), role, created_at: date, expires_at: date,
    accepted_at: date.nullable(), revoked_at: date.nullable(),
  })).max(MAX_DEMO_INVITATIONS),
});
type Data = z.infer<typeof schema>;

function fresh(sessionId: string, now: number): Data {
  const ago = (days: number) => new Date(now - days * DAY).toISOString();
  const account = (user_id: string, email: string, name: string | null, r: Role, active: boolean, days: number) => ({ user_id, email, name, role: r, active, created_at: ago(days) });
  const invitation = (id: string, email: string, r: Role, created: number, expiresInDays: number, accepted: number | null, revoked: number | null) => ({
    id, email, role: r, created_at: ago(created), expires_at: new Date(now + expiresInDays * DAY).toISOString(),
    accepted_at: accepted === null ? null : ago(accepted), revoked_at: revoked === null ? null : ago(revoked),
  });
  return {
    sessionId,
    accounts: [
      account(DEMO_YOU_ID, 'you@demo.example', 'Demo Admin', 'Admin', true, 60),
      account('demo-mara', 'mara.ellis@demo.example', 'Mara Ellis', 'Admin', true, 45),
      account('demo-noah', 'noah.quinn@demo.example', 'Noah Quinn', 'Member', true, 20),
      account('demo-priya', 'priya.shah@demo.example', 'Priya Shah', 'Member', false, 12),
      account('demo-sam', 'sam.rivera@demo.example', null, 'Member', true, 3),
    ],
    invitations: [
      invitation('demo-inv-1', 'lee.park@demo.example', 'Member', 5, 25, null, null), // pending
      invitation('demo-inv-2', 'old.invite@demo.example', 'Member', 40, -10, null, null), // expired
      invitation('demo-inv-3', 'noah.quinn@demo.example', 'Member', 22, 8, 20, null), // accepted: Noah's account
      invitation('demo-inv-4', 'withdrawn@demo.example', 'Admin', 15, 15, null, 14), // revoked
    ],
  };
}

/** The saved data for this session, or fresh fictional data, saved at once so its dates stay fixed from here on. */
function read(sessionId: string, now: number): Data {
  try {
    const raw = sessionStorage.getItem(DEMO_ADMIN_DATA_KEY);
    if (raw) {
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.sessionId === sessionId) return parsed.data;
    }
  } catch { /* unreadable: start again with fresh data */ }
  const created = fresh(sessionId, now);
  write(created); // if the browser refuses, the list still shows; the next change reports it
  return created;
}

/** Saves, or reports that the browser refused. */
function write(data: Data): boolean {
  try {
    sessionStorage.setItem(DEMO_ADMIN_DATA_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

type StoredInvitation = Data['invitations'][number];
const stateOf = (i: StoredInvitation, now: number): Invitation['state'] =>
  i.revoked_at ? 'revoked' : i.accepted_at ? 'accepted' : Date.parse(i.expires_at) <= now ? 'expired' : 'pending';
const toInvitation = (i: StoredInvitation, now: number): Invitation => ({ ...i, state: stateOf(i, now) });

// The same address rule as admin_create_invitation: one address, no whitespace, control characters, separators, quotes or brackets.
const EMAIL = /^[^@\s\u0000-\u001f\u007f,;<>"()\\]+@[^@\s\u0000-\u001f\u007f,;<>"()\\]+\.[^@\s\u0000-\u001f\u007f,;<>"()\\]+$/;

/** The fictional lists in the real list action's order: accounts oldest first, invitations newest first. */
function demoAdminList(sessionId: string, now = Date.now()): AdminList {
  const data = read(sessionId, now);
  return {
    accounts: [...data.accounts].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    invitations: [...data.invitations].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map((i) => toInvitation(i, now)),
  };
}

/** Runs one Admin action on the fictional data. Never throws and never leaves the tab. */
export function demoAdmin<T>(request: AdminAction, sessionId: string, now = Date.now()): AdminResult<T> {
  const fail = (code: string, message = adminMessage(code, request.action)): AdminResult<T> => ({ ok: false, code, message });
  const done = (data: unknown): AdminResult<T> => ({ ok: true, data: data as T });
  // Once the demo has ended (sign-out is deleting its files) nothing may write the fictional data back.
  if (currentDemoId() !== sessionId) return fail(NOT_ADMIN_CODE);
  const data = read(sessionId, now);
  const save = (result: unknown): AdminResult<T> => (write(data) ? done(result) : fail('storage', DEMO_STORAGE_MESSAGE));
  const lastActiveAdmin = (target: Data['accounts'][number]) =>
    target.role === 'Admin' && target.active && !data.accounts.some((other) => other.role === 'Admin' && other.active && other.user_id !== target.user_id);

  switch (request.action) {
    case 'list':
      return done(demoAdminList(sessionId, now));

    case 'invite': {
      const email = request.email.trim().toLowerCase();
      if (email.length > 254 || !EMAIL.test(email)) return fail('invalid_email');
      if (!role.safeParse(request.role).success) return fail('invalid_role');
      if (data.accounts.some((account) => account.email === email)) return fail('account_exists');
      if (data.invitations.some((i) => i.email === email && !i.accepted_at && !i.revoked_at)) return fail('invitation_exists');
      if (data.invitations.length >= MAX_DEMO_INVITATIONS) return fail('demo_limit', DEMO_LIMIT_MESSAGE);
      const created: StoredInvitation = {
        id: `demo-inv-${crypto.randomUUID()}`, email, role: request.role, created_at: new Date(now).toISOString(),
        expires_at: new Date(now + 30 * DAY).toISOString(), accepted_at: null, revoked_at: null,
      };
      data.invitations.push(created);
      return save(toInvitation(created, now));
    }

    case 'resend': {
      const found = data.invitations.find((i) => i.id === request.id);
      if (!found || stateOf(found, now) !== 'pending') return fail('invitation_not_pending');
      return done(toInvitation(found, now)); // nothing to save: no email goes anywhere
    }

    case 'extend':
    case 'revoke': {
      const found = data.invitations.find((i) => i.id === request.id);
      if (!found || found.accepted_at || found.revoked_at) return fail('invitation_closed');
      if (request.action === 'extend') found.expires_at = new Date(now + 30 * DAY).toISOString();
      else found.revoked_at = new Date(now).toISOString();
      return save(toInvitation(found, now));
    }

    case 'setRole': {
      if (!role.safeParse(request.role).success) return fail('invalid_role');
      const target = data.accounts.find((account) => account.user_id === request.userId);
      if (!target) return fail('account_not_found');
      if (request.role !== 'Admin' && lastActiveAdmin(target)) return fail('last_admin');
      target.role = request.role;
      return save(target);
    }

    case 'deactivate':
    case 'reactivate': {
      const target = data.accounts.find((account) => account.user_id === request.userId);
      if (!target) return fail('account_not_found');
      if (request.action === 'deactivate' && lastActiveAdmin(target)) return fail('last_admin');
      target.active = request.action === 'reactivate';
      return save(target);
    }
  }
}
