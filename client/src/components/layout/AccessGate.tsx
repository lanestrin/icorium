import { Fragment, useEffect, type ReactNode } from 'react';
import { useAccount } from '../../hooks/useAccount';
import { useWorkspace } from '../../hooks/useWorkspace';
import { pageAccess, type AccessOutcome, type Requirement } from '../../lib/access';
import { browserLocation } from '../../lib/navigation';
import { PAGES } from '../../lib/pages';
import page from '../../styles/page.module.scss';
import { Button } from '../ui/Button';
import type { AccountApi } from './AccountMenu';
import { AppShell } from './AppShell';
import styles from './AccessGate.module.scss';

const MESSAGES: Record<Exclude<AccessOutcome, 'allow' | 'loading' | 'sign-in'>, { title: string; text: string }> = {
  'admins-only': { title: 'Admins only', text: 'This page is for administrators.' },
  'no-profile': { title: 'Account not active yet', text: 'Use your invitation to activate it, or ask an administrator.' },
  inactive: { title: 'Account deactivated', text: 'Account deactivated. Ask an administrator.' },
  unavailable: { title: 'Temporarily unavailable', text: "Your account couldn't be checked. Try again in a few minutes." },
};

/** A full-page status, announced politely, for a page that isn't known to be allowed yet or whose code is downloading. */
export function PageStatus({ children }: { children: ReactNode }) {
  return (
    <main className={page.shell}>
      <p role="status" className={page.intro}>{children}</p>
    </main>
  );
}

/**
 * Opens a protected page only for an account the access rule allows (build-plan 17.6). It reads the account once and
 * hands it to the page. A denied page is never rendered, so its code isn't downloaded and its effects never run. The
 * workspace follows the account here too, so it closes when access is lost, even though the page is gone by then.
 */
export function AccessGate({ requirement, children }: { requirement: Requirement; children: (account: AccountApi) => ReactNode }) {
  const account = useAccount();
  const { key } = useWorkspace(account.account);
  const outcome = pageAccess(account.account, requirement);

  useEffect(() => {
    if (outcome === 'sign-in') browserLocation.replace(PAGES.signIn);
  }, [outcome]);

  // A page the browser restores as it was (Back) may show a workspace whose session has ended, so read it again.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => { if (event.persisted) browserLocation.reload(); };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, []);

  // The key starts the page again for another account's workspace, and only then.
  if (outcome === 'allow') return <Fragment key={key}>{children(account)}</Fragment>;
  if (outcome === 'loading') return <PageStatus>Loading page…</PageStatus>;
  if (outcome === 'sign-in') return <PageStatus>Opening sign-in…</PageStatus>;

  const message = MESSAGES[outcome];
  return (
    <AppShell account={account}>
      <main className={styles.message}>
        <h1 className={page.title}>{message.title}</h1>
        <p role="alert">{message.text}</p>
        {outcome === 'admins-only' && <a href="/">Go to CSV Files</a>}
        {outcome === 'unavailable' && <Button variant="secondary" onClick={() => browserLocation.reload()}>Try again</Button>}
      </main>
    </AppShell>
  );
}
