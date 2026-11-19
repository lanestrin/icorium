import type { SupabaseClient } from '@supabase/supabase-js';

/** The two public build variables that turn sign-in on (build-plan 17.2b). */
export type AuthEnv = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string };

/**
 * The Supabase project URL and publishable key, or null when either is missing or blank. A site
 * without both (CI, local development, today's Vercel site) has no sign-in and behaves as the demo.
 */
export function authConfig(env: AuthEnv): { url: string; key: string } | null {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  return url && key ? { url, key } : null;
}

/** True when this build has both Supabase settings. Synchronous, so pages can decide before any download. */
export function isAuthConfigured(): boolean {
  return authConfig(import.meta.env) !== null;
}

let client: Promise<SupabaseClient | null> | undefined;

/**
 * The one shared Supabase client, or null when sign-in isn't set up. The library is downloaded only
 * the first time this is called on a configured site, so the demo's main bundle doesn't include it.
 * PKCE keeps the sign-in, confirmation and recovery codes out of the URL fragment; detectSessionInUrl
 * finishes those redirects when the page loads.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!client) {
    const config = authConfig(import.meta.env);
    client = config
      ? import('@supabase/supabase-js').then(({ createClient }) =>
          createClient(config.url, config.key, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } }),
        )
      : Promise.resolve(null);
  }
  return client;
}
