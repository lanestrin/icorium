import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabase, isAuthConfigured } from '../lib/supabase';
import { fakeSession, fakeSupabase } from '../test-fixtures/fake-supabase';
import { isActiveAdmin, useAccount, type AccountState, type Profile } from './useAccount';

vi.mock('../lib/supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn(() => true) }));

const active = { name: 'Ada', role: 'Admin' as const, active: true };

function setUp(options: Parameters<typeof fakeSupabase>[0]) {
  const fake = fakeSupabase(options);
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  return fake;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthConfigured).mockReturnValue(true);
});

describe('useAccount', () => {
  it('reports a site without Supabase settings, without loading anything', () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    const { result } = renderHook(() => useAccount());
    expect(result.current.account).toEqual({ status: 'unconfigured' });
    expect(getSupabase).not.toHaveBeenCalled();
  });

  it('starts loading, then reports signed out when there is no session', async () => {
    setUp({});
    const { result } = renderHook(() => useAccount());
    expect(result.current.account).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.account).toEqual({ status: 'signed-out' }));
  });

  it('reads the signed-in person’s own profile', async () => {
    setUp({ session: fakeSession(), profile: active });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account).toEqual({ status: 'signed-in', userId: 'user-1', email: 'ada@example.com', profile: active }));
  });

  it('reports an account with no profile as not activated (profile null)', async () => {
    setUp({ session: fakeSession() });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account).toMatchObject({ status: 'signed-in', profile: null }));
  });

  it('keeps a deactivated profile so the page can explain it', async () => {
    setUp({ session: fakeSession(), profile: { ...active, active: false } });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account).toMatchObject({ status: 'signed-in', profile: { active: false } }));
  });

  it('reports a failed profile read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setUp({ session: fakeSession(), profileError: { code: 'PGRST301', message: 'boom' } });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account).toEqual({ status: 'error', message: 'Something went wrong. Try again.' }));
  });

  it('ignores a slow profile read that finishes after signing out (F-39)', async () => {
    const fake = setUp({ session: fakeSession(), profile: active });
    let finishRead: (result: { data: unknown; error: unknown }) => void = () => {};
    fake.maybeSingle.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(fake.maybeSingle).toHaveBeenCalled());

    act(() => fake.emit('SIGNED_OUT', null));
    expect(result.current.account).toEqual({ status: 'signed-out' });

    await act(async () => {
      finishRead({ data: active, error: null });
      await Promise.resolve();
    });
    expect(result.current.account).toEqual({ status: 'signed-out' });
  });

  it('notices a password-reset link', async () => {
    setUp({ session: fakeSession(), profile: active, initialEvent: 'PASSWORD_RECOVERY' });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.recovering).toBe(true));
  });

  it('signs out on this device only and returns to signed out', async () => {
    const fake = setUp({ session: fakeSession(), profile: active });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account.status).toBe('signed-in'));
    await act(() => result.current.signOut());
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result.current.account).toEqual({ status: 'signed-out' });
  });

  it('shows why sign-out failed', async () => {
    const fake = setUp({ session: fakeSession(), profile: active });
    fake.auth.signOut.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account.status).toBe('signed-in'));
    await act(() => result.current.signOut());
    expect(result.current.actionError).toBe('Sign-in is temporarily unavailable. Try again later.');
  });

  it('saves a trimmed name to the person’s own profile', async () => {
    const fake = setUp({ session: fakeSession(), profile: { ...active, name: null } });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account.status).toBe('signed-in'));
    let outcome: string | null = 'not run';
    await act(async () => { outcome = await result.current.saveName('  Ada Lovelace  '); });
    expect(outcome).toBeNull();
    expect(fake.update).toHaveBeenCalledWith({ name: 'Ada Lovelace' });
    expect(fake.updateEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result.current.account).toMatchObject({ profile: { name: 'Ada Lovelace' } });
  });

  it('refuses a blank name and reports a failed save', async () => {
    const fake = setUp({ session: fakeSession(), profile: { ...active, name: null } });
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.account.status).toBe('signed-in'));
    expect(await result.current.saveName('   ')).toBe('Enter your name (up to 100 characters).');
    expect(fake.update).not.toHaveBeenCalled();
    fake.updateEq.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    expect(await result.current.saveName('Ada')).toBe('Sign-in is temporarily unavailable. Try again later.');
  });
});

describe('isActiveAdmin', () => {
  const signedIn = (profile: Profile | null): AccountState => ({ status: 'signed-in', userId: 'u', email: 'a@example.com', profile });
  it('is true only for a signed-in, active Admin', () => {
    expect(isActiveAdmin(signedIn({ name: 'Ada', role: 'Admin', active: true }))).toBe(true);
    expect(isActiveAdmin(signedIn({ name: 'Ada', role: 'Member', active: true }))).toBe(false);
    expect(isActiveAdmin(signedIn({ name: 'Ada', role: 'Admin', active: false }))).toBe(false);
    expect(isActiveAdmin(signedIn(null))).toBe(false);
    for (const status of ['unconfigured', 'loading', 'signed-out'] as const) expect(isActiveAdmin({ status })).toBe(false);
    expect(isActiveAdmin({ status: 'error', message: 'x' })).toBe(false);
  });
});
