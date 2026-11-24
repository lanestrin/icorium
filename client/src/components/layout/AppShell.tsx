import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { HelpCircle, Menu, Network, UploadCloud, Wand2, X } from 'lucide-react';
import { canSeeAdminPages } from '../../hooks/useAccount';
import { entryHref, HELP_URL, type AdminSection, type NavEntry, type WorkspaceSection } from '../../lib/navigation';
import { PAGES } from '../../lib/pages';
import page from '../../styles/page.module.scss';
import { AccountMenu, type AccountApi } from './AccountMenu';
import { AppNav } from './AppNav';
import styles from './layout.module.scss';

const currentPath = () => window.location.pathname.replace(/\/+$/, '');

/**
 * The frame of every app page (build-plan 17.9): the header, the left navigation and the page's content.
 * The page passes the account its gate read. Generator and Architecture links show only to an active Admin. title and intro are the workspace's "Dashboard" heading in
 * the header; other pages keep their own heading in their content. onNavigate lets the current page apply a
 * navigation entry that points at itself (scroll, focus, filter) instead of reloading; it gets the entry's section.
 */
export function AppShell({ account, title, intro, onNavigate, children }: {
  account: AccountApi;
  title?: string;
  intro?: string;
  onNavigate?: (section: WorkspaceSection | AdminSection) => void;
  children: ReactNode;
}) {
  const [hash, setHash] = useState(() => window.location.hash);
  const [menuOpen, setMenuOpen] = useState(false);
  // An entry chosen in the open drawer is applied once the drawer has closed: while it is open it holds focus,
  // and when it closes it would pull focus back to Menu, so the page could not move focus to its section.
  const afterClose = useRef<(() => void) | null>(null);
  const path = currentPath();
  const isAdmin = canSeeAdminPages(account.account);

  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  function choose(event: MouseEvent, entry?: NavEntry) {
    setMenuOpen(false);
    if (!entry || !onNavigate || entry.path !== path) return; // another page: the link loads it
    event.preventDefault();
    const href = entryHref(entry);
    if (window.location.pathname + window.location.hash !== href) window.history.pushState(null, '', href);
    setHash(entry.hash);
    if (menuOpen) afterClose.current = () => onNavigate(entry.section);
    else onNavigate(entry.section);
  }

  return (
    <div className={page.shell}>
      <header className={styles.header}>
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger className={styles.menuButton} aria-label="Open navigation">
            <Menu aria-hidden />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.drawerBackdrop}>
              <Dialog.Content
                className={styles.drawer}
                aria-describedby={undefined}
                onCloseAutoFocus={(event) => {
                  const apply = afterClose.current;
                  afterClose.current = null;
                  if (!apply) return; // nothing chosen: focus returns to Menu
                  event.preventDefault();
                  apply();
                }}
              >
                <div className={styles.drawerHead}>
                  <Dialog.Title className={styles.drawerTitle}>Navigation</Dialog.Title>
                  <Dialog.Close className={styles.menuButton} aria-label="Close navigation"><X aria-hidden /></Dialog.Close>
                </div>
                <AppNav isAdmin={isAdmin} path={path} hash={hash} withPages onChoose={choose} />
              </Dialog.Content>
            </Dialog.Overlay>
          </Dialog.Portal>
        </Dialog.Root>

        <a href="/" className={styles.brand}><UploadCloud aria-hidden /> CSV Files</a>
        {title && (
          <div className={styles.headerTitle}>
            <h1 className={styles.pageTitle}>{title}</h1>
            {intro && <p className={styles.pageIntro}>{intro}</p>}
          </div>
        )}
        {isAdmin && (
          <nav aria-label="Pages" className={styles.headerLinks}>
            <a href={PAGES.generator} aria-current={path === PAGES.generator ? 'page' : undefined} className={page.navLink}>
              <Wand2 aria-hidden /> CSV Generator
            </a>
            <a href={PAGES.architecture} aria-current={path === PAGES.architecture ? 'page' : undefined} className={page.navLink}>
              <Network aria-hidden /> Architecture
            </a>
          </nav>
        )}
        <a href={HELP_URL} target="_blank" rel="noopener noreferrer" className={styles.helpButton} aria-label="Help (opens in a new tab)">
          <HelpCircle aria-hidden />
        </a>
        <AccountMenu {...account} />
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <AppNav isAdmin={isAdmin} path={path} hash={hash} onChoose={choose} />
        </aside>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
