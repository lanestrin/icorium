import { useState } from 'react';
import { useAccount } from '../hooks/useAccount';
import { NAME_MAX } from '../lib/auth';
import { AuthField } from './auth/AuthField';
import { Modal } from './modals/Modal';
import { Button } from './ui/Button';
import styles from './AccountStatus.module.scss';

/**
 * The signed-in account at the end of the file workspace's navigation (build-plan 17.2b). Nothing shows
 * on a site without sign-in, while the session loads, or when signed out; there is no sign-in link until
 * 17.6. The role is shown, not enforced: access checks live in trusted code.
 */
export function AccountStatus() {
  const { account, actionError, signOut, saveName } = useAccount();
  const [namePromptDismissed, setNamePromptDismissed] = useState(false);

  if (account.status !== 'signed-in' && account.status !== 'error') return null;

  let label: string;
  if (account.status === 'error') label = account.message;
  else if (!account.profile) label = 'Account not active yet';
  else if (!account.profile.active) label = 'Account deactivated';
  else label = `${account.profile.name || account.email} · ${account.profile.role}`;

  const askForName = account.status === 'signed-in' && account.profile?.active && !account.profile.name && !namePromptDismissed;

  return (
    <span className={styles.account}>
      <span aria-label="Account" className={styles.label}>{label}</span>
      <Button variant="link" size="sm" onClick={() => void signOut()}>Sign out</Button>
      {actionError && <span role="alert" className={styles.error}>{actionError}</span>}
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
