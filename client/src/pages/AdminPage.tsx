import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AccountList } from '../components/admin/AccountList';
import { formatDate, InvitationList } from '../components/admin/InvitationList';
import { InviteForm } from '../components/admin/InviteForm';
import styles from '../components/admin/admin.module.scss';
import { AppVersion } from '../components/AppVersion';
import { Banner } from '../components/Banner';
import { Modal } from '../components/modals/Modal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAccount } from '../hooks/useAccount';
import { callAdmin, NOT_ADMIN_CODE, type Account, type AdminAction, type AdminList, type Invitation, type Role } from '../lib/admin';
import { NOT_SET_UP_MESSAGE } from '../lib/auth';
import { PAGES } from '../lib/pages';
import page from '../styles/page.module.scss';

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: AdminList };
type Notice = { tone: 'success' | 'error'; text: string };
type Confirmation = { title: string; text: string; label: string; run: () => void };

/**
 * /admin (build-plan 17.3): invite people, manage invitations, change roles and deactivate or reactivate
 * accounts. Every request goes to the Admin function, which checks the caller is an active Admin, so this
 * page only decides what to show; hiding it protects nothing. Admins see account and invitation details,
 * never files. There is no link to this page until 17.6.
 */
export function AdminPage() {
  const { account } = useAccount();
  const isAdmin = account.status === 'signed-in' && account.profile?.active === true && account.profile.role === 'Admin';
  const currentUserId = account.status === 'signed-in' ? account.userId : '';

  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [lostAccess, setLostAccess] = useState(false);
  const latest = useRef(0); // the newest list request; older replies are ignored

  const load = useCallback(async () => {
    const request = ++latest.current;
    const result = await callAdmin<AdminList>({ action: 'list' });
    if (request !== latest.current) return;
    if (result.ok) setList({ status: 'ready', data: result.data });
    else if (result.code === NOT_ADMIN_CODE) setLostAccess(true);
    else setList({ status: 'error', message: result.message });
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setList({ status: 'loading' });
    void load();
    return () => {
      latest.current++; // ignore a reply that arrives after the page is gone
    };
  }, [isAdmin, load]);

  /** Sends one action, shows its outcome and refreshes the lists. Resolves to whether it worked. */
  async function run<T>(request: AdminAction, success: (data: T) => string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    const result = await callAdmin<T>(request);
    if (result.ok) setNotice({ tone: 'success', text: success(result.data) });
    else if (result.code === NOT_ADMIN_CODE) setLostAccess(true);
    else setNotice({ tone: 'error', text: result.message });
    // Some failures still change state (a deactivation whose sessions were not ended), so always refresh.
    if (!(!result.ok && result.code === NOT_ADMIN_CODE)) await load();
    setBusy(false);
    return result.ok;
  }

  const ask = (title: string, text: string, label: string, action: () => void) => setConfirm({ title, text, label, run: action });

  const invite = (email: string, role: Role) => run<Invitation>({ action: 'invite', email, role }, () => `Invitation sent to ${email}`);
  const resend = (inv: Invitation) => void run({ action: 'resend', id: inv.id }, () => `Invitation sent again to ${inv.email}`);
  const extend = (inv: Invitation) => void run<Invitation>({ action: 'extend', id: inv.id }, (data) => `Invitation to ${inv.email} now expires on ${formatDate(data.expires_at)}`);
  const revoke = (inv: Invitation) =>
    ask('Revoke invitation?', `${inv.email} will no longer be able to activate an account with this invitation.`, 'Revoke', () =>
      void run({ action: 'revoke', id: inv.id }, () => `Invitation to ${inv.email} revoked`));
  const toggleRole = (acct: Account) => {
    const role: Role = acct.role === 'Admin' ? 'Member' : 'Admin';
    ask(`Make ${role}?`, `${acct.email} will be ${role === 'Admin' ? 'able to administer the app' : 'no longer able to administer the app'}.`, `Make ${role}`, () =>
      void run({ action: 'setRole', userId: acct.user_id, role }, () => `${acct.email} is now ${role}`));
  };
  const toggleActive = (acct: Account) => {
    if (acct.active)
      ask('Deactivate account?', `${acct.email} will be signed out and blocked from the app. Their files are kept.`, 'Deactivate', () =>
        void run({ action: 'deactivate', userId: acct.user_id }, () => `${acct.email} deactivated`));
    else void run({ action: 'reactivate', userId: acct.user_id }, () => `${acct.email} reactivated`);
  };

  function body(): ReactNode {
    if (account.status === 'unconfigured') return <p role="status" className={styles.notice}>{NOT_SET_UP_MESSAGE}</p>;
    if (account.status === 'loading') return <p role="status" className={styles.notice}>Loading…</p>;
    if (account.status === 'error') return <Banner tone="error">{account.message}</Banner>;
    if (account.status === 'signed-out') return <p className={styles.notice}>Sign in to continue. <a href={PAGES.signIn}>Go to sign in</a></p>;
    if (!isAdmin) return <p role="alert" className={styles.notice}>Admins only. This page is for administrators.</p>;
    if (lostAccess) return <p role="alert" className={styles.notice}>You no longer have Admin access.</p>;

    return (
      <>
        {notice && <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Banner>}
        <Card as="section" className={styles.section} aria-labelledby="invite-heading">
          <h2 id="invite-heading" className={styles.heading}>Invite someone</h2>
          <InviteForm busy={busy} onInvite={invite} />
        </Card>
        {list.status === 'loading' && <p role="status" className={styles.notice}>Loading accounts and invitations…</p>}
        {list.status === 'error' && (
          <Card className={styles.section}>
            <Banner tone="error">{list.message}</Banner>
            <div className={styles.actions}><Button variant="outline" onClick={() => { setList({ status: 'loading' }); void load(); }}>Try again</Button></div>
          </Card>
        )}
        {list.status === 'ready' && (
          <>
            <Card as="section" className={styles.section} aria-labelledby="invitations-heading">
              <h2 id="invitations-heading" className={styles.heading}>Invitations</h2>
              <InvitationList invitations={list.data.invitations} busy={busy} onResend={resend} onExtend={extend} onRevoke={revoke} />
            </Card>
            <Card as="section" className={styles.section} aria-labelledby="accounts-heading">
              <h2 id="accounts-heading" className={styles.heading}>Accounts</h2>
              <AccountList accounts={list.data.accounts} currentUserId={currentUserId} busy={busy} onToggleRole={toggleRole} onToggleActive={toggleActive} />
            </Card>
          </>
        )}
      </>
    );
  }

  return (
    <div className={page.shell}>
      <main className={styles.page}>
        <div className={styles.content}>
          <nav aria-label="Pages" className={page.nav}>
            <a href="/" className={page.navLink}><ArrowLeft aria-hidden /> Back to CSV Files</a>
            <AppVersion />
          </nav>
          <header className={styles.header}>
            <h1 className={page.title}>Admin</h1>
            <p className={page.intro}>Invite people and manage account access. Administrators cannot see anyone's files.</p>
          </header>
          {body()}
        </div>
      </main>
      {confirm && (
        <Modal
          narrow
          title={confirm.title}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => { const action = confirm.run; setConfirm(null); action(); }}>{confirm.label}</Button>
            </>
          }
        >
          <p>{confirm.text}</p>
        </Modal>
      )}
    </div>
  );
}
