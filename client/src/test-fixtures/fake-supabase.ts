// A stand-in for the Supabase client in tests (build-plan 17.2b). It records calls, lets a test emit auth
// events, and answers profile reads and updates with whatever the test sets. Tests only.
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';
import type { Profile } from '../hooks/useAccount';

type Result = { data?: unknown; error: unknown };
type Listener = (event: string, session: Session | null) => void;

export function fakeSession(email = 'ada@example.com', id = 'user-1'): Session {
  return { user: { id, email } } as unknown as Session;
}

/**
 * A fake client. session is the one reported at start; profile answers the profile read. Like auth-js, it removes
 * ?code= from the address once a session starts, unless keepCode says the code was never exchanged.
 */
export function fakeSupabase({ session = null as Session | null, profile = null as Profile | null, profileError = null as unknown, initialEvent = 'INITIAL_SESSION', keepCode = false } = {}) {
  let listener: Listener | undefined;
  const emit = (event: string, next: Session | null) => listener?.(event, next);

  const profileRead = { data: profile, error: profileError };
  const maybeSingle = vi.fn(async (): Promise<Result> => profileRead);
  const update = vi.fn(() => ({ eq: updateEq }));
  const updateEq = vi.fn(async (): Promise<Result> => ({ error: null }));

  const auth = {
    onAuthStateChange: vi.fn((callback: Listener) => {
      listener = callback;
      queueMicrotask(() => {
        if (session && !keepCode) {
          const url = new URL(window.location.href);
          url.searchParams.delete('code');
          window.history.replaceState(window.history.state, '', url.toString());
        }
        callback(initialEvent, session);
      });
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn(async (): Promise<Result> => ({ data: {}, error: null })),
    signInWithOAuth: vi.fn(async (): Promise<Result> => ({ data: {}, error: null })),
    signUp: vi.fn(async (): Promise<Result> => ({ data: { user: {}, session: null }, error: null })),
    resetPasswordForEmail: vi.fn(async (): Promise<Result> => ({ data: {}, error: null })),
    updateUser: vi.fn(async (): Promise<Result> => ({ data: {}, error: null })),
    signOut: vi.fn(async (): Promise<Result> => {
      emit('SIGNED_OUT', null);
      return { error: null };
    }),
  };
  // Edge Function calls (the Admin page). A test sets the reply: { data } or { error }.
  const invoke = vi.fn(async (): Promise<Result> => ({ data: { data: null }, error: null }));
  const client = {
    auth,
    functions: { invoke },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }), update })),
  };
  return { client: client as unknown as SupabaseClient, auth, maybeSingle, update, updateEq, invoke, emit };
}
