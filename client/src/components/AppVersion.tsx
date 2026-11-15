import { versionLabel } from '../lib/app-version';
import styles from './AppVersion.module.scss';

/** The running version, e.g. "v1.0.0 · Test", at the end of a page's navigation. Nothing when no version is set. */
export function AppVersion() {
  const label = versionLabel(import.meta.env.VITE_APP_VERSION, import.meta.env.VITE_APP_ENV);
  if (!label) return null;
  return <span aria-label="App version" className={styles.version}>{label}</span>;
}
