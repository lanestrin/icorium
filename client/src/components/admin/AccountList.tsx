import type { Account } from '../../lib/admin';
import { classNames } from '../../lib/class-names';
import { Button } from '../ui/Button';
import styles from './admin.module.scss';

/** Each account with its role and status, and the role and access controls. Role and access are decided on the server. */
export function AccountList({ accounts, currentUserId, busy, onToggleRole, onToggleActive }: {
  accounts: Account[];
  currentUserId: string;
  busy: boolean;
  onToggleRole: (account: Account) => void;
  onToggleActive: (account: Account) => void;
}) {
  if (accounts.length === 0) return <p className={styles.notice}>No accounts yet.</p>;
  return (
    <ul className={styles.list} aria-label="Accounts">
      {accounts.map((account) => (
        <li key={account.user_id} className={styles.row}>
          <div className={styles.details}>
            <span className={styles.primary}>
              {account.name || account.email}
              {account.user_id === currentUserId && ' (you)'}
            </span>
            <span className={styles.meta}>{account.name ? `${account.email} · ` : ''}{account.role}</span>
            <span className={classNames(styles.badge, account.active ? styles.badgeActive : styles.badgeDeactivated)}>
              {account.active ? 'Active' : 'Deactivated'}
            </span>
          </div>
          <div className={styles.actions}>
            <Button variant="outline" size="sm" disabled={busy} aria-label={`${account.role === 'Admin' ? 'Make Member' : 'Make Admin'}: ${account.email}`} onClick={() => onToggleRole(account)}>
              {account.role === 'Admin' ? 'Make Member' : 'Make Admin'}
            </Button>
            <Button variant={account.active ? 'danger' : 'outline'} size="sm" disabled={busy} aria-label={`${account.active ? 'Deactivate' : 'Reactivate'} ${account.email}`} onClick={() => onToggleActive(account)}>
              {account.active ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
