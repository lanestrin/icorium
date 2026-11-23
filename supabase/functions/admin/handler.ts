// Admin actions for invitations and account access (build-plan 17.3).
//
// All request logic lives here, with no Deno or package imports, so Vitest can run it. index.ts wires
// the real services. The caller is the user ID verified from the bearer token; any `actor`, owner or
// role field in the request body is ignored. Every decision about who may do what is made in the SQL
// functions (supabase/migrations/20261122000000_admin_access.sql); this file only checks the shape
// of the request, sends the email and ends sessions.

export type RpcResult = { data: unknown; error: { message: string } | null };

export type Deps = {
  /** The site's address, such as https://example.vercel.app. Used for CORS and the activation link. */
  siteUrl: string;
  /** The user ID for a valid access token, or null. */
  verifyToken: (token: string) => Promise<string | null>;
  /** Calls one of the admin_* SQL functions as the service role. */
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  /** Bans (true) or unbans (false) a user in Auth, so their sessions cannot refresh. Returns whether it worked. */
  setBan: (userId: string, banned: boolean) => Promise<boolean>;
  /** Sends one plain-text email. Throws when the mail server does not accept it. */
  sendEmail: (message: { to: string; subject: string; text: string }) => Promise<void>;
};

type Invitation = { id: string; email: string; role: string; expires_at: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_CHARS = 4096;

/** SQL error messages the function passes on, with their HTTP status. Anything else is a generic 500. */
const SQL_ERRORS: Record<string, number> = {
  not_admin: 403,
  invalid_email: 400,
  invalid_role: 400,
  invalid_active: 400,
  account_not_found: 404,
  account_exists: 409,
  invitation_exists: 409,
  invitation_not_pending: 409,
  invitation_closed: 409,
  last_admin: 409,
};

/** The plain-text invitation. The link carries only the address, never a secret: the invitation record decides. */
export function invitationEmail(invitation: Invitation, siteUrl: string): { subject: string; text: string } {
  const base = siteUrl.replace(/\/+$/, '');
  const expires = new Date(invitation.expires_at).toISOString().slice(0, 10);
  return {
    subject: "You're invited to Reclaim Studio",
    text: [
      `You have been invited to Reclaim Studio as a ${invitation.role}.`,
      '',
      'Activate your account with this address, using a password or Google:',
      `${base}/activate?email=${encodeURIComponent(invitation.email)}`,
      '',
      `This invitation expires on ${expires} (UTC). If you were not expecting it, ignore this email.`,
    ].join('\n'),
  };
}

export async function handleAdminRequest(request: Request, deps: Deps): Promise<Response> {
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': new URL(deps.siteUrl).origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const fail = (status: number, error: string) => reply(status, { error });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return fail(405, 'method_not_allowed');

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  let actor: string | null = null;
  try {
    actor = token ? await deps.verifyToken(token) : null;
  } catch {
    actor = null;
  }
  if (!actor) return fail(401, 'unauthorized');

  let input: Record<string, unknown>;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_CHARS) return fail(400, 'invalid_request');
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fail(400, 'invalid_request');
    input = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'invalid_request');
  }

  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined);
  const uuid = (key: string) => {
    const value = text(key);
    return value && UUID.test(value) ? value : undefined;
  };

  /** Calls a SQL function as the verified actor. Known SQL failures become their status; others a generic 500. */
  async function call(name: string, args: Record<string, unknown>): Promise<{ data: unknown } | Response> {
    let result: RpcResult;
    try {
      // `actor` is set last, so nothing in the request can replace it.
      result = await deps.rpc(name, { ...args, actor });
    } catch {
      return fail(500, 'server_error');
    }
    if (result.error) {
      const status = SQL_ERRORS[result.error.message];
      return status ? fail(status, result.error.message) : fail(500, 'server_error');
    }
    return { data: result.data };
  }

  switch (input.action) {
    case 'list': {
      const result = await call('admin_list', {});
      return result instanceof Response ? result : reply(200, { data: result.data });
    }

    case 'invite': {
      const email = text('email');
      const role = input.role === undefined ? 'Member' : text('role');
      if (!email || !role) return fail(400, 'invalid_request');
      const created = await call('admin_create_invitation', { target_email: email, target_role: role });
      if (created instanceof Response) return created;
      const invitation = created.data as Invitation;
      try {
        await deps.sendEmail({ to: invitation.email, ...invitationEmail(invitation, deps.siteUrl) });
      } catch {
        // No email went out, so no invitation should exist for the Admin to wonder about.
        // If that also fails, say so: the unsent invitation is still listed as pending (F-50).
        const discarded = await call('admin_discard_unsent_invitation', { target_id: invitation.id });
        return fail(502, discarded instanceof Response ? 'email_failed_pending' : 'email_failed');
      }
      return reply(200, { data: invitation });
    }

    case 'resend': {
      const id = uuid('id');
      if (!id) return fail(400, 'invalid_request');
      const pending = await call('admin_pending_invitation', { target_id: id });
      if (pending instanceof Response) return pending;
      const invitation = pending.data as Invitation;
      try {
        await deps.sendEmail({ to: invitation.email, ...invitationEmail(invitation, deps.siteUrl) });
      } catch {
        return fail(502, 'email_failed'); // the invitation stays pending
      }
      return reply(200, { data: invitation });
    }

    case 'extend':
    case 'revoke': {
      const id = uuid('id');
      if (!id) return fail(400, 'invalid_request');
      const result = await call(input.action === 'extend' ? 'admin_extend_invitation' : 'admin_revoke_invitation', { target_id: id });
      return result instanceof Response ? result : reply(200, { data: result.data });
    }

    case 'setRole': {
      const userId = uuid('userId');
      const role = text('role');
      if (!userId || !role) return fail(400, 'invalid_request');
      const result = await call('admin_set_role', { target_user: userId, target_role: role });
      return result instanceof Response ? result : reply(200, { data: result.data });
    }

    case 'deactivate':
    case 'reactivate': {
      const userId = uuid('userId');
      if (!userId) return fail(400, 'invalid_request');
      const deactivate = input.action === 'deactivate';
      // The SQL change comes first: it enforces the Admin and last-Admin rules and blocks data access at once.
      const result = await call('admin_set_active', { target_user: userId, target_active: !deactivate });
      if (result instanceof Response) return result;
      let banned = false;
      try {
        banned = await deps.setBan(userId, deactivate);
      } catch {
        banned = false;
      }
      if (!banned) return fail(502, deactivate ? 'sessions_not_ended' : 'still_banned');
      return reply(200, { data: result.data });
    }

    default:
      return fail(400, 'invalid_request');
  }
}
