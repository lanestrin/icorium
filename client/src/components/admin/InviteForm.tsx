import { useId, useState, type FormEvent } from 'react';
import type { Role } from '../../lib/admin';
import { AuthField } from '../auth/AuthField';
import { Button } from '../ui/Button';
import styles from './admin.module.scss';

/** Email plus role (Member by default). Calls onInvite, which resolves true when the email was sent, so the form clears. */
export function InviteForm({ busy, onInvite }: { busy: boolean; onInvite: (email: string, role: Role) => Promise<boolean> }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('Member');
  const roleId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onInvite(email.trim(), role)) {
      setEmail('');
      setRole('Member');
    }
  }

  return (
    <form className={styles.inviteForm} onSubmit={(event) => void submit(event)}>
      <div className={styles.grow}>
        <AuthField label="Email" type="email" autoComplete="off" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className={styles.field}>
        <label htmlFor={roleId} className={styles.label}>Role</label>
        <select id={roleId} className={styles.select} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="Member">Member</option>
          <option value="Admin">Admin</option>
        </select>
      </div>
      <Button type="submit" loading={busy}>{busy ? 'Sending…' : 'Send invitation'}</Button>
    </form>
  );
}
