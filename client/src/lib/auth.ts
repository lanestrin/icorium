// Plain messages for Supabase Auth errors (build-plan 17.2b). Errors are told apart by their `code`,
// `name` and `status`, as https://supabase.com/docs/guides/auth/debugging/error-codes recommends, never
// by matching message text. That also keeps this file free of a runtime import from supabase-js, so the
// demo's main bundle doesn't pull the library in.

/** The invite-only hook's rejection, word for word from supabase/migrations/20261118000000_identity.sql. */
export const INVITE_ONLY_MESSAGE = 'Sign-up is by invitation only. Ask an administrator for an invitation.';

export const UNAVAILABLE_MESSAGE = 'Sign-in is temporarily unavailable. Try again later.';
export const UNEXPECTED_MESSAGE = 'Something went wrong. Try again.';
/** Shown on every sign-in page of a site without Supabase settings. */
export const NOT_SET_UP_MESSAGE = "Sign-in isn't set up on this site yet.";

/** The longest name a profile may hold, matching the check on public.profiles.name. */
export const NAME_MAX = 100;

/** The trimmed name, or null when it is empty or longer than NAME_MAX characters. */
export function cleanName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

/**
 * Where Supabase sends the person back to: always this site plus a fixed path, never input or URL text.
 * Both land on a page that reads a failed redirect's error (redirectError) instead of losing it.
 */
export function redirectUrl(path: '/sign-in' | '/reset-password'): string {
  return `${window.location.origin}${path}`;
}

export const LINK_EXPIRED_MESSAGE = 'This link has expired or was already used. Ask for a new one.';
export const REDIRECT_FAILED_MESSAGE = "Sign-in didn't finish. Try again.";

/** The error parameters Supabase adds to a redirect that failed (Google sign-in, a confirmation or reset link). */
const REDIRECT_ERROR_KEYS = ['error', 'error_code', 'error_description'];

/**
 * The message for a redirect that came back with an error, or null when it carries none. Reads the query
 * string and the hash the way auth-js does (parseParametersFromURL: the query string wins). auth-js
 * reports these only as an initialize() error, not an auth event, so the page reads them itself.
 */
export function redirectError(search: string, hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  new URLSearchParams(search).forEach((value, key) => params.set(key, value));
  if (!REDIRECT_ERROR_KEYS.some((key) => params.has(key))) return null;
  const code = params.get('error_code') ?? '';
  if (code === 'otp_expired' || code === 'flow_state_expired') return LINK_EXPIRED_MESSAGE;
  if ((params.get('error_description') ?? '').includes(INVITE_ONLY_MESSAGE)) return INVITE_ONLY_MESSAGE;
  return MESSAGES[code] ?? REDIRECT_FAILED_MESSAGE;
}

/** The current address without Supabase's redirect error parameters, so a reload doesn't show the error again. */
export function withoutRedirectError(href: string): string {
  const url = new URL(href);
  for (const key of REDIRECT_ERROR_KEYS) url.searchParams.delete(key);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const key of REDIRECT_ERROR_KEYS) hash.delete(key);
  url.hash = hash.toString();
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The fields of an AuthError (or any thrown value) this file reads. */
type AuthErrorLike = { name?: unknown; code?: unknown; status?: unknown; message?: unknown; reasons?: unknown };

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Confirm your email address first. Check your inbox for the link.',
  over_email_send_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
  same_password: 'Choose a different password from your current one.',
  user_banned: 'This account is deactivated. Ask an administrator.',
};

/** Supabase's password-strength reasons (AuthWeakPasswordError.reasons), as words a person can act on. */
const REASONS: Record<string, string> = {
  length: 'make it longer',
  characters: 'mix letters, numbers and symbols',
  pwned: 'pick one that has not appeared in a data breach',
};

/** True for a failed request: no network, a paused project, or Supabase's own retryable fetch error. */
function isUnavailable(error: AuthErrorLike): boolean {
  return error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.name === 'TypeError' && /fetch/i.test(String(error.message)));
}

/**
 * The message to show for a failed sign-in, sign-up, recovery or update. Unknown errors get a general
 * message and are logged for debugging; nothing here reveals whether an account or invitation exists.
 */
export function authErrorMessage(error: unknown): string {
  const e = (typeof error === 'object' && error !== null ? error : {}) as AuthErrorLike;
  if (isUnavailable(e)) return UNAVAILABLE_MESSAGE;
  if (e.message === INVITE_ONLY_MESSAGE) return INVITE_ONLY_MESSAGE;
  if (e.code === 'weak_password' || e.name === 'AuthWeakPasswordError') {
    const reasons = Array.isArray(e.reasons) ? e.reasons.map((r) => REASONS[String(r)]).filter(Boolean) : [];
    return reasons.length ? `Choose a stronger password: ${reasons.join(', ')}.` : 'Choose a stronger password.';
  }
  const known = typeof e.code === 'string' ? MESSAGES[e.code] : undefined;
  if (known) return known;
  console.error('Unexpected sign-in error', error);
  return UNEXPECTED_MESSAGE;
}
