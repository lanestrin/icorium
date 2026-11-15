// Which version is running and where, for the small label in each page's navigation.
// The values are worked out at build time in vite.config.ts and contain no secrets.

/**
 * An explicit label (the APP_ENV_LABEL build variable) when one is set; otherwise "Test" for a Vercel Preview
 * build of main, "Preview" for any other branch, and "" for production and local builds. Vercel's Production
 * environment deploys main as the Test site, so it sets APP_ENV_LABEL=Test.
 */
export function environmentLabel({ vercelEnv, branch, label }: { vercelEnv?: string; branch?: string; label?: string }) {
  if (label) return label;
  if (vercelEnv !== 'preview') return '';
  return branch === 'main' ? 'Test' : 'Preview';
}

/** "v1.0.0", "v1.0.0 · Test", or "" when there is no version to show. */
export function versionLabel(version?: string, environment?: string) {
  if (!version) return '';
  return environment ? `v${version} · ${environment}` : `v${version}`;
}
