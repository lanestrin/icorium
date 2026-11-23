import { UNAVAILABLE_MESSAGE, UNEXPECTED_MESSAGE } from './auth';
import { getSupabase } from './supabase';

export type Role = 'Admin' | 'Member';
export type InvitationState = 'pending' | 'accepted' | 'expired' | 'revoked';

/** One row of public.profiles as the Admin sees it: account details only, never files. */
export type Account = { user_id: string; email: string; name: string | null; role: Role; active: boolean; created_at: string };

export type Invitation = {
  id: string;
  email: string;
  role: Role;
  state: InvitationState;
  created_at: string;
  expires_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
};

export type AdminList = { accounts: Account[]; invitations: Invitation[] };

/** The requests the Admin function accepts (supabase/functions/admin). The server decides who may send them. */
export type AdminAction =
  | { action: 'list' }
  | { action: 'invite'; email: string; role: Role }
  | { action: 'resend' | 'extend' | 'revoke'; id: string }
  | { action: 'setRole'; userId: string; role: Role }
  | { action: 'deactivate' | 'reactivate'; userId: string };

export type AdminResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export const NOT_ADMIN_CODE = 'not_admin';

const MESSAGES: Record<string, string> = {
  not_admin: 'You no longer have Admin access.',
  unauthorized: 'Sign in again to continue.',
  invalid_email: 'Enter a valid email address.',
  invalid_role: 'Choose Admin or Member.',
  invalid_request: UNEXPECTED_MESSAGE,
  account_exists: 'An account with this email already exists.',
  invitation_exists: 'This email already has an open invitation. Resend or extend it instead.',
  invitation_not_pending: 'This invitation is no longer pending. Extend it first.',
  invitation_closed: 'This invitation was already accepted or revoked.',
  account_not_found: 'That account no longer exists.',
  last_admin: 'At least one active Admin must remain.',
  sessions_not_ended: "Account deactivated, but its open sessions couldn't be ended. Try again.",
  still_banned: 'Account reactivated, but sign-in is still blocked. Try again.',
};

/** The message for an error code. A failed email depends on whether this was a new invitation or a resend. */
export function adminMessage(code: string, action?: AdminAction['action']): string {
  if (code === 'email_failed')
    return action === 'invite'
      ? "The invitation email couldn't be sent, so no invitation was created. Try again later."
      : "The email couldn't be sent. The invitation is still pending.";
  return MESSAGES[code] ?? UNEXPECTED_MESSAGE;
}

/** Reads the {error} body of a non-2xx reply. Supabase puts the Response on error.context. */
async function errorCode(error: { context?: unknown }): Promise<string | null> {
  const context = error.context;
  if (!(context instanceof Response)) return null;
  try {
    const body = (await context.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

/** Sends one request to the Admin function with the signed-in person's token. Never throws. */
export async function callAdmin<T>(request: AdminAction): Promise<AdminResult<T>> {
  const fail = (code: string, message: string): AdminResult<T> => ({ ok: false, code, message });
  try {
    const supabase = await getSupabase();
    if (!supabase) return fail('unavailable', UNAVAILABLE_MESSAGE);
    const { data, error } = await supabase.functions.invoke('admin', { body: request });
    if (error) {
      const code = error.name === 'FunctionsHttpError' ? await errorCode(error as { context?: unknown }) : null;
      if (!code) return fail('unavailable', UNAVAILABLE_MESSAGE);
      return fail(code, adminMessage(code, request.action));
    }
    return { ok: true, data: (data as { data: T }).data };
  } catch {
    return fail('unavailable', UNAVAILABLE_MESSAGE);
  }
}
