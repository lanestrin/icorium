// Which version is running and where, for the small label in each page's navigation.
// The values are worked out at build time in vite.config.ts and contain no secrets.

/** "Test" for a Vercel Preview build of main, "Preview" for any other branch, "" for production and local builds. */
export function environmentLabel({ vercelEnv, branch }: { vercelEnv?: string; branch?: string }) {
  if (vercelEnv !== 'preview') return '';
  return branch === 'main' ? 'Test' : 'Preview';
}

/** "v1.0.0", "v1.0.0 · Test", or "" when there is no version to show. */
export function versionLabel(version?: string, environment?: string) {
  if (!version) return '';
  return environment ? `v${version} · ${environment}` : `v${version}`;
}
