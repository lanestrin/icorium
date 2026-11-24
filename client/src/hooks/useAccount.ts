import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { authErrorMessage, cleanName, NAME_MAX } from '../lib/auth';
import { claimDemoLock, currentDemoId, dropDemoId, endDemo, sweepStaleDemos } from '../lib/demo';
import { PAGES } from '../lib/pages';
import { getSupabase, isAuthConfigured } from '../lib/supabase';

/** A signed-in person's own row in public.profiles (17.2a). null means the account isn't activated yet. */
export type Profile = { name: string | null; role: 'Admin' | 'Member'; active: boolean };

export type AccountState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; email: string; profile: Profile | null }
  | { status: 'demo'; sessionId: string }
  | { status: 'error'; message: string };

/** True only for an active Admin. It decides which links and pages are shown; trusted code protects the data. */
export const isActiveAdmin = (account: AccountState) =>
  account.status === 'signed-in' && account.profile?.active === true && account.profile.role === 'Admin';

/**
 * The signed-in account, kept current from Supabase's auth events. AccessGate (17.6) shows pages
 * by it; row-level security and trusted code protect the data, never this hook.
 *
 * recovering turns true when the page was opened from a password-reset link (the PASSWORD_RECOVERY
 * event), so the reset page can ask for the new password.
 *
 * A tab that started the guest demo (17.5) reports status 'demo' instead, whatever Supabase says: the demo has no
 * account and never opens the cloud. A duplicated tab that finds its demo held by another tab gives the demo up.
 * hasSession says whether Supabase has a session, even behind a demo or before the profile is read, so the sign-in page can leave the demo.
 */
export function useAccount() {
  const [account, setAccount] = useState<AccountState>(() => (isAuthConfigured() ? { status: 'loading' } : { status: 'unconfigured' }));
  const [demo, setDemo] = useState<{ id: string; claimed: boolean } | null>(() => {
    const id = currentDemoId();
    return id ? { id, claimed: false } : null;
  });
  const [hasSession, setHasSession] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const client = useRef<SupabaseClient | null>(null);

  // Takes this tab's demo lock; a tab that doesn't get it (a duplicate) drops the copied demo ID, deleting nothing.
  useEffect(() => {
    if (!demo || demo.claimed) return;
    let cancelled = false;
    void claimDemoLock(demo.id).then((ok) => {
      if (cancelled) return;
      if (ok) setDemo({ id: demo.id, claimed: true });
      else {
        dropDemoId();
        setDemo(null);
      }
    });
    return () => { cancelled = true; };
  }, [demo]);

  // Removes demo databases whose tab is gone.
  useEffect(() => { void sweepStaleDemos(currentDemoId()); }, []);

  useEffect(() => {
    if (!isAuthConfigured()) return;
    let cancelled = false;
    let latest = 0; // the newest profile read; older replies are ignored
    let unsubscribe = () => {};

    async function loadProfile(supabase: SupabaseClient, session: Session, request: number) {
      try {
        const { data, error } = await supabase.from('profiles').select('name, role, active').eq('user_id', session.user.id).maybeSingle();
        if (cancelled || request !== latest) return;
        if (error) setAccount({ status: 'error', message: authErrorMessage(error) });
        else setAccount({ status: 'signed-in', userId: session.user.id, email: session.user.email ?? '', profile: (data as Profile | null) ?? null });
      } catch (error) {
        if (!cancelled && request === latest) setAccount({ status: 'error', message: authErrorMessage(error) });
      }
    }

    getSupabase().then(
      (supabase) => {
        if (cancelled || !supabase) return;
        client.current = supabase;
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') setRecovering(true);
          const request = ++latest;
          setHasSession(session !== null);
          if (!session) {
            setAccount({ status: 'signed-out' });
            return;
          }
          // Another person's session: their profile isn't known yet, so the previous account's page must not stay open.
          setAccount((state) => (state.status === 'signed-in' && state.userId !== session.user.id ? { status: 'loading' } : state));
          // Read the profile after the callback returns: Supabase holds its auth lock while it runs, so
          // another Supabase call awaited inside it could wait forever.
          setTimeout(() => void loadProfile(supabase, session, request), 0);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      },
      (error) => {
        if (!cancelled) setAccount({ status: 'error', message: authErrorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  /** Signs out on this device only (other devices stay signed in). The auth event updates the state. */
  const signOut = useCallback(async () => {
    setActionError(null);
    if (demo) {
      // Ends this tab's demo and deletes its files; a Supabase session held by another tab is left alone.
      // The demo state stays until the page unloads, so the open page never switches to another workspace first.
      await endDemo(demo.id);
      window.location.assign(PAGES.signIn);
      return;
    }
    try {
      const { error } = (await client.current?.auth.signOut({ scope: 'local' })) ?? { error: null };
      if (error) setActionError(authErrorMessage(error));
    } catch (error) {
      setActionError(authErrorMessage(error));
    }
  }, [demo]);

  /** Saves the person's own name. Resolves to an error message, or null when it was saved. */
  const saveName = useCallback(async (raw: string): Promise<string | null> => {
    const name = cleanName(raw);
    if (!name) return `Enter your name (up to ${NAME_MAX} characters).`;
    const current = account.status === 'signed-in' ? account : null;
    if (!current || !client.current) return authErrorMessage(null);
    try {
      const { error } = await client.current.from('profiles').update({ name }).eq('user_id', current.userId);
      if (error) return authErrorMessage(error);
    } catch (error) {
      return authErrorMessage(error);
    }
    setAccount((state) => (state.status === 'signed-in' && state.profile ? { ...state, profile: { ...state.profile, name } } : state));
    return null;
  }, [account]);

  const visible: AccountState = demo ? (demo.claimed ? { status: 'demo', sessionId: demo.id } : { status: 'loading' }) : account;
  return { account: visible, hasSession, recovering, actionError, signOut, saveName };
}
