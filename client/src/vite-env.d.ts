/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The app version from the root package.json, set in vite.config.ts. */
  readonly VITE_APP_VERSION?: string;
  /** "Test", "Preview" or "", from APP_ENV_LABEL or Vercel's build-time variables (see lib/app-version.ts). */
  readonly VITE_APP_ENV?: string;
  /** The Supabase project URL (public). With the key below it turns sign-in on; see lib/supabase.ts. */
  readonly VITE_SUPABASE_URL?: string;
  /** The Supabase publishable key (public, safe in the browser). Never the secret key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
