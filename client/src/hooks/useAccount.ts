import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { authErrorMessage, cleanName, NAME_MAX } from '../lib/auth';
import { getSupabase, isAuthConfigured } from '../lib/supabase';

/** A signed-in person's own row in public.profiles (17.2a). null means the account isn't activated yet. */
export type Profile = { name: string | null; role: 'Admin' | 'Member'; active: boolean };

export type AccountState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; userId: string; email: string; profile: Profile | null }
  | { status: 'error'; message: string };

/**
 * The signed-in account, kept current from Supabase's auth events. The role is for display only:
 * access is enforced by row-level security and trusted code (17.6), never by this hook.
 *
 * recovering turns true when the page was opened from a password-reset link (the PASSWORD_RECOVERY
 * event), so the reset page can ask for the new password.
 */
export function useAccount() {
  const [account, setAccount] = useState<AccountState>(() => (isAuthConfigured() ? { status: 'loading' } : { status: 'unconfigured' }));
  const [recovering, setRecovering] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const client = useRef<SupabaseClient | null>(null);

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
          if (!session) {
            setAccount({ status: 'signed-out' });
            return;
          }
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
    try {
      const { error } = (await client.current?.auth.signOut({ scope: 'local' })) ?? { error: null };
      if (error) setActionError(authErrorMessage(error));
    } catch (error) {
      setActionError(authErrorMessage(error));
    }
  }, []);

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

  return { account, recovering, actionError, signOut, saveName };
}
