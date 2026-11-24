import { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, FolderDown, LogOut, User } from 'lucide-react';
import type { useAccount } from '../../hooks/useAccount';
import { NAME_MAX } from '../../lib/auth';
import { PAGES } from '../../lib/pages';
import { AuthField } from '../auth/AuthField';
import { ExportBrowserFilesModal } from '../modals/ExportBrowserFilesModal';
import { Modal } from '../modals/Modal';
import { Button } from '../ui/Button';
import styles from './layout.module.scss';

/** What the account menu needs from the page's useAccount(): the shell takes it so a page subscribes once. */
export type AccountApi = Pick<ReturnType<typeof useAccount>, 'account' | 'actionError' | 'signOut' | 'saveName'>;

/** Up to two capital letters from a name's first words, else the email's first letter; '' when there is neither. */
export function initials(name: string | null | undefined, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words.length ? words.slice(0, 2).map((w) => [...w][0]).join('') : ([...email.trim()][0] ?? '');
  return letters.toUpperCase();
}

/**
 * The account at the right end of the header (build-plan 17.2b, 17.9): a Sign in link when signed out, and a
 * menu with the name, role and Sign out when signed in. Nothing shows on a site without sign-in or while the
 * session loads. The role is shown, not enforced: access checks live in trusted code. A demo guest (17.5) sees
 * "Demo guest" and Sign out, which discards the demo. Any signed-in account can export the files kept in this browser.
 */
export function AccountMenu({ account, actionError, signOut, saveName }: AccountApi) {
  const [namePromptDismissed, setNamePromptDismissed] = useState(false);
  const [exporting, setExporting] = useState(false);

  // The dialog belongs to a signed-in account: it closes when that account goes, and doesn't reopen at the next sign-in.
  useEffect(() => {
    if (account.status !== 'signed-in') setExporting(false);
  }, [account.status]);

  if (account.status === 'unconfigured' || account.status === 'loading') return <span className={styles.accountSpace} />;
  if (account.status === 'signed-out') return <a href={PAGES.signIn} className={styles.signIn}>Sign in</a>;

  let primary: string;
  let secondary: string | undefined;
  let letters = '';
  if (account.status === 'error') primary = account.message;
  else if (account.status === 'demo') {
    primary = 'Demo guest';
    secondary = 'Temporary demo';
    letters = 'D';
  }
  else if (!account.profile) primary = 'Account not active yet';
  else if (!account.profile.active) primary = 'Account deactivated';
  else {
    primary = account.profile.name || account.email;
    secondary = account.profile.role;
    letters = initials(account.profile.name, account.email);
  }
  const label = secondary ? `${primary} · ${secondary}` : primary;
  const askForName = account.status === 'signed-in' && account.profile?.active && !account.profile.name && !namePromptDismissed;

  return (
    <span className={styles.account}>
      {/* A status region, so a failed account read is announced; the hidden prefix names it for screen readers. */}
      <span role="status" className={styles.hidden}>Account: {label}</span>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger aria-label={`Account menu, ${label}`} className={styles.accountTrigger}>
          <span className={styles.avatar} aria-hidden>{letters || <User />}</span>
          <ChevronDown className={styles.chevron} aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} loop className={styles.menu}>
            <DropdownMenu.Label className={styles.menuHeading}>
              <span className={styles.menuName}>{primary}</span>
              {secondary && <span className={styles.menuRole}>{secondary}</span>}
            </DropdownMenu.Label>
            {account.status === 'signed-in' && (
              <DropdownMenu.Item className={styles.menuItem} onSelect={() => setExporting(true)}>
                <FolderDown aria-hidden /> Export this browser's files
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => void signOut()}>
              <LogOut aria-hidden /> Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {actionError && <span role="alert" className={styles.accountError}>{actionError}</span>}
      {exporting && account.status === 'signed-in' && <ExportBrowserFilesModal onClose={() => setExporting(false)} />}
      {askForName && <NamePrompt onSave={saveName} onClose={() => setNamePromptDismissed(true)} />}
    </span>
  );
}

/** Asks a person who signed up with Google (and so gave no name) what to call them. Later asks again next visit. */
function NamePrompt({ onSave, onClose }: { onSave: (name: string) => Promise<string | null>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const problem = await onSave(name);
    setSaving(false);
    if (problem) setError(problem);
    else onClose();
  }

  return (
    <Modal
      narrow
      title="What should we call you?"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>Later</Button>
          <Button type="submit" form="name-prompt" loading={saving}>Save</Button>
        </>
      }
    >
      <form id="name-prompt" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <AuthField
          label="Name"
          autoComplete="name"
          hint={`Up to ${NAME_MAX} characters.`}
          value={name}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
      </form>
    </Modal>
  );
}
