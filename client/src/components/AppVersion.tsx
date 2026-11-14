import { versionLabel } from '../lib/app-version';

/** The running version, e.g. "v1.0.0 · Test", at the end of a page's navigation. Nothing when no version is set. */
export function AppVersion() {
  const label = versionLabel(import.meta.env.VITE_APP_VERSION, import.meta.env.VITE_APP_ENV);
  if (!label) return null;
  return <span aria-label="App version" className="text-xs font-normal text-slate-500">{label}</span>;
}
