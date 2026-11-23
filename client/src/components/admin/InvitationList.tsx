import type { Invitation } from '../../lib/admin';
import { classNames } from '../../lib/class-names';
import { Button } from '../ui/Button';
import styles from './admin.module.scss';

const BADGE: Record<Invitation['state'], string> = {
  pending: styles.badgePending,
  accepted: styles.badgeAccepted,
  expired: styles.badgeExpired,
  revoked: styles.badgeRevoked,
};

const STATE_LABEL: Record<Invitation['state'], string> = { pending: 'Pending', accepted: 'Accepted', expired: 'Expired', revoked: 'Revoked' };

/** A date such as "22 Dec 2026", in UTC so the invitation email and the page agree. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Every invitation with its state. Resend is for pending ones; Extend and Revoke for pending or expired ones. */
export function InvitationList({ invitations, busy, onResend, onExtend, onRevoke }: {
  invitations: Invitation[];
  busy: boolean;
  onResend: (invitation: Invitation) => void;
  onExtend: (invitation: Invitation) => void;
  onRevoke: (invitation: Invitation) => void;
}) {
  if (invitations.length === 0) return <p className={styles.notice}>No invitations yet.</p>;
  return (
    <ul className={styles.list} aria-label="Invitations">
      {invitations.map((invitation) => {
        const open = invitation.state === 'pending' || invitation.state === 'expired';
        const dateLabel = invitation.state === 'expired' ? 'Expired' : invitation.state === 'pending' ? 'Expires' : null;
        return (
          <li key={invitation.id} className={styles.row}>
            <div className={styles.details}>
              <span className={styles.primary}>{invitation.email}</span>
              <span className={styles.meta}>
                {invitation.role}
                {dateLabel && ` · ${dateLabel} ${formatDate(invitation.expires_at)}`}
              </span>
              <span className={classNames(styles.badge, BADGE[invitation.state])}>{STATE_LABEL[invitation.state]}</span>
            </div>
            {open && (
              <div className={styles.actions}>
                {invitation.state === 'pending' && (
                  <Button variant="outline" size="sm" disabled={busy} aria-label={`Resend invitation to ${invitation.email}`} onClick={() => onResend(invitation)}>Resend</Button>
                )}
                <Button variant="outline" size="sm" disabled={busy} aria-label={`Extend invitation to ${invitation.email}`} onClick={() => onExtend(invitation)}>Extend</Button>
                <Button variant="danger" size="sm" disabled={busy} aria-label={`Revoke invitation to ${invitation.email}`} onClick={() => onRevoke(invitation)}>Revoke</Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
