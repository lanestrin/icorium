import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminMessage, callAdmin } from './admin';
import { UNAVAILABLE_MESSAGE, UNEXPECTED_MESSAGE } from './auth';
import { getSupabase } from './supabase';
import { fakeSupabase } from '../test-fixtures/fake-supabase';

vi.mock('./supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn(() => true) }));

/** The error Supabase returns for a non-2xx reply: the Response is on error.context. */
const httpError = (body: unknown) => ({ name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status: 409 }) });

afterEach(() => vi.clearAllMocks());

describe('callAdmin', () => {
  it('sends the request to the admin function and returns its data', async () => {
    const fake = fakeSupabase();
    fake.invoke.mockResolvedValue({ data: { data: { accounts: [], invitations: [] } }, error: null });
    vi.mocked(getSupabase).mockResolvedValue(fake.client);
    const result = await callAdmin({ action: 'list' });
    expect(fake.invoke).toHaveBeenCalledWith('admin', { body: { action: 'list' } });
    expect(result).toEqual({ ok: true, data: { accounts: [], invitations: [] } });
  });

  it.each([
    ['not_admin', 'You no longer have Admin access.'],
    ['last_admin', 'At least one active Admin must remain.'],
    ['account_exists', 'An account with this email already exists.'],
    ['sessions_not_ended', "Account deactivated, but its open sessions couldn't be ended. Try again."],
    ['still_banned', 'Account reactivated, but sign-in is still blocked. Try again.'],
    ['something_new', UNEXPECTED_MESSAGE],
  ])('maps the %s reply to its message', async (code, message) => {
    const fake = fakeSupabase();
    fake.invoke.mockResolvedValue({ data: null, error: httpError({ error: code }) });
    vi.mocked(getSupabase).mockResolvedValue(fake.client);
    expect(await callAdmin({ action: 'deactivate', userId: 'u' })).toEqual({ ok: false, code, message });
  });

  it('words a failed email by whether it was a new invitation or a resend', () => {
    expect(adminMessage('email_failed', 'invite')).toContain('no invitation was created');
    expect(adminMessage('email_failed', 'resend')).toContain('still pending');
    expect(adminMessage('email_failed', 'invite')).not.toMatch(/delivered/i);
  });

  it('reports a network failure, an unreadable reply and a missing client as unavailable', async () => {
    const fake = fakeSupabase();
    vi.mocked(getSupabase).mockResolvedValue(fake.client);
    fake.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } });
    expect((await callAdmin({ action: 'list' })).ok).toBe(false);
    fake.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', context: new Response('<html>', { status: 500 }) } });
    expect(await callAdmin({ action: 'list' })).toMatchObject({ ok: false, code: 'unavailable', message: UNAVAILABLE_MESSAGE });
    fake.invoke.mockRejectedValue(new Error('offline'));
    expect(await callAdmin({ action: 'list' })).toMatchObject({ ok: false, message: UNAVAILABLE_MESSAGE });
    vi.mocked(getSupabase).mockResolvedValue(null);
    expect(await callAdmin({ action: 'list' })).toMatchObject({ ok: false, message: UNAVAILABLE_MESSAGE });
  });
});
