import type { MouseEvent, ReactNode } from 'react';
import { BarChart3, FileText, Home, Network, Play, ShieldCheck, UserPlus, Users, Wand2 } from 'lucide-react';
import { ADMIN_ENTRIES, entryHref, WORKSPACE_ENTRIES, type NavEntry } from '../../lib/navigation';
import { PAGES } from '../../lib/pages';
import { AppVersion } from '../AppVersion';
import styles from './layout.module.scss';

const ICONS: Record<string, ReactNode> = {
  Dashboard: <Home aria-hidden />,
  'My Files': <FileText aria-hidden />,
  Processing: <Play aria-hidden />,
  Results: <BarChart3 aria-hidden />,
  Invitations: <UserPlus aria-hidden />,
  Users: <Users aria-hidden />,
  'Access & Roles': <ShieldCheck aria-hidden />,
};

/** The entry for the current URL: the workspace entry named by the hash, or the Admin entry for /admin#section. */
const isCurrent = (entry: NavEntry, path: string, hash: string) => entry.path === path && entry.hash === hash;

/**
 * The left navigation: the file workspace's entries, an Admin group shown only to an active Admin or an Admin demo (display
 * only; AccessGate decides which pages open and trusted code protects the data), and the app version. Help is the header's ? link.
 * withPages adds the Generator and Architecture links for the phone menu, where the header hides them; they too are for an active Admin or an Admin demo.
 */
export function AppNav({ isAdmin, path, hash, withPages, onChoose }: {
  isAdmin: boolean; path: string; hash: string; withPages?: boolean; onChoose: (event: MouseEvent, entry?: NavEntry) => void;
}) {
  const link = (entry: NavEntry) => (
    <li key={entry.label}>
      <a
        href={entryHref(entry)}
        aria-current={isCurrent(entry, path, hash) ? 'page' : undefined}
        className={styles.navItem}
        onClick={(event) => onChoose(event, entry)}
      >
        {ICONS[entry.label]} {entry.label}
      </a>
    </li>
  );

  return (
    <nav aria-label="App" className={styles.appNav}>
      <div className={styles.navLinks}>
        <ul className={styles.navList}>{WORKSPACE_ENTRIES.map(link)}</ul>
        {isAdmin && (
          <>
            <hr className={styles.navDivider} />
            <h2 className={styles.navGroup}>Admin</h2>
            <ul className={styles.navList}>{ADMIN_ENTRIES.map(link)}</ul>
          </>
        )}
        {withPages && isAdmin && (
          <>
            <hr className={styles.navDivider} />
            <ul className={styles.navList}>
              <li>
                <a href={PAGES.generator} aria-current={path === PAGES.generator ? 'page' : undefined} className={styles.navItem} onClick={(e) => onChoose(e)}>
                  <Wand2 aria-hidden /> CSV Generator
                </a>
              </li>
              <li>
                <a href={PAGES.architecture} aria-current={path === PAGES.architecture ? 'page' : undefined} className={styles.navItem} onClick={(e) => onChoose(e)}>
                  <Network aria-hidden /> Architecture
                </a>
              </li>
            </ul>
          </>
        )}
      </div>
      <div className={styles.navFoot}>
        <AppVersion />
      </div>
    </nav>
  );
}
