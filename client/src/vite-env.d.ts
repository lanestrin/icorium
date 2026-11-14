/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The app version from the root package.json, set in vite.config.ts. */
  readonly VITE_APP_VERSION?: string;
  /** "Test", "Preview" or "", from Vercel's build-time variables (see lib/app-version.ts). */
  readonly VITE_APP_ENV?: string;
}
