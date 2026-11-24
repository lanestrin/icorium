import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccountList } from '../components/admin/AccountList';
import { formatDate, InvitationList } from '../components/admin/InvitationList';
import { InviteForm } from '../components/admin/InviteForm';
import styles from '../components/admin/admin.module.scss';
import { AppShell } from '../components/layout/AppShell';
import { Banner } from '../components/Banner';
import { Modal } from '../components/modals/Modal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { AccountApi } from '../components/layout/AccountMenu';
import { isAdminDemo } from '../hooks/useAccount';
import { useHashSection } from '../hooks/useHashSection';
import { demoAdmin, DEMO_YOU_ID } from '../lib/demo-admin';
import { callAdmin, NOT_ADMIN_CODE, type Account, type AdminAction, type AdminList, type Invitation, type Role } from '../lib/admin';
import { ADMIN_HASHES, showAndFocus, type AdminSection, type WorkspaceSection } from '../lib/navigation';
import page from '../styles/page.module.scss';

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: AdminList };
type Notice = { tone: 'success' | 'error'; text: string };
type Confirmation = { title: string; text: string; label: string; run: () => void };

/**
 * /admin (build-plan 17.3): invite people, manage invitations, change roles and deactivate or reactivate
 * accounts. Every request goes to the Admin function, which checks the caller is an active Admin. The gate
 * (17.6) opens this page for an active Admin or an Admin demo (17.10); that decides what is shown, and the function
 * protects the data. An Admin demo never reaches the function: its actions are simulated on fictional data.
 * Admins see account and invitation details, never files.
 */
export function AdminPage({ account }: { account: AccountApi }) {
  const demoSession = account.account.status === 'demo' && isAdminDemo(account.account) ? account.account.sessionId : null;
  const demo = demoSession !== null;
  const currentUserId = account.account.status === 'signed-in' ? account.account.userId : demo ? DEMO_YOU_ID : '';
  // An Admin demo (17.10) uses the fictional backend and never the Admin function; a real Admin never uses it.
  const send = useCallback(
    <T,>(request: AdminAction) => (demoSession ? Promise.resolve(demoAdmin<T>(request, demoSession)) : callAdmin<T>(request)),
    [demoSession],
  );
  const simulated = (text: string) => (demo ? `${text} (simulated)` : text);

  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [lostAccess, setLostAccess] = useState(false);
  const latest = useRef(0); // the newest list request; older replies are ignored

  const load = useCallback(async () => {
    const request = ++latest.current;
    const result = await send<AdminList>({ action: 'list' });
    if (request !== latest.current) return;
    if (result.ok) setList({ status: 'ready', data: result.data });
    else if (result.code === NOT_ADMIN_CODE) setLostAccess(true);
    else setList({ status: 'error', message: result.message });
  }, [send]);

  useEffect(() => {
    void load();
    return () => {
      latest.current++; // ignore a reply that arrives after the page is gone
    };
  }, [load]);

  /** Sends one action, shows its outcome and refreshes the lists. Resolves to whether it worked. */
  async function run<T>(request: AdminAction, success: (data: T) => string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    const result = await send<T>(request);
    if (result.ok) setNotice({ tone: 'success', text: success(result.data) });
    else if (result.code === NOT_ADMIN_CODE) setLostAccess(true);
    else setNotice({ tone: 'error', text: result.message });
    // Some failures still change state (a deactivation whose sessions were not ended), so always refresh.
    if (!(!result.ok && result.code === NOT_ADMIN_CODE)) await load();
    setBusy(false);
    return result.ok;
  }

  // A demo describes only the simulation, never a real effect.
  const ask = (title: string, text: string, demoText: string, label: string, action: () => void) =>
    setConfirm({ title, text: demo ? demoText : text, label, run: action });
  // Your own fictional row never changes the demo's access; for demotion and deactivation say what a real Admin would face.
  const ownRow = (acct: Account) => (demo && acct.user_id === DEMO_YOU_ID ? '. A real Admin would lose access; the demo stays open.' : '');

  const invite = (email: string, role: Role) => run<Invitation>({ action: 'invite', email, role }, () => (demo ? `Invitation to ${email} simulated. No email was sent.` : `Invitation sent to ${email}`));
  const resend = (inv: Invitation) => void run({ action: 'resend', id: inv.id }, () => (demo ? `Invitation to ${inv.email} simulated again. No email was sent.` : `Invitation sent again to ${inv.email}`));
  const extend = (inv: Invitation) => void run<Invitation>({ action: 'extend', id: inv.id }, (data) => simulated(`Invitation to ${inv.email} now expires on ${formatDate(data.expires_at)}`));
  const revoke = (inv: Invitation) =>
    ask('Revoke invitation?', `${inv.email} will no longer be able to activate an account with this invitation.`, `In this demo, the fictional invitation to ${inv.email} will be marked revoked. Nothing is sent.`, 'Revoke', () =>
      void run({ action: 'revoke', id: inv.id }, () => simulated(`Invitation to ${inv.email} revoked`)));
  const toggleRole = (acct: Account) => {
    const role: Role = acct.role === 'Admin' ? 'Member' : 'Admin';
    ask(`Make ${role}?`, `${acct.email} will be ${role === 'Admin' ? 'able to administer the app' : 'no longer able to administer the app'}.`, `In this demo, ${acct.email} will be shown as ${role}. No real account changes.`, `Make ${role}`, () =>
      void run({ action: 'setRole', userId: acct.user_id, role }, () => simulated(`${acct.email} is now ${role}`) + (role === 'Member' ? ownRow(acct) : '')));
  };
  const toggleActive = (acct: Account) => {
    if (acct.active)
      ask('Deactivate account?', `${acct.email} will be signed out and blocked from the app. Their files are kept.`, `In this demo, ${acct.email} will be shown as deactivated. No real account changes.`, 'Deactivate', () =>
        void run({ action: 'deactivate', userId: acct.user_id }, () => simulated(`${acct.email} deactivated`) + ownRow(acct)));
    else void run({ action: 'reactivate', userId: acct.user_id }, () => simulated(`${acct.email} reactivated`));
  };

  // The navigation's Admin entries: Invitations opens the invite card, Users and Access & Roles the account list
  // (where roles and deactivation are). They apply once the list has loaded; before that
  // there is nothing to show and the address is ignored.
  function goToSection(section: WorkspaceSection | AdminSection) {
    if (section === 'invitations') showAndFocus('invite-heading');
    else if (section === 'users' || section === 'access') showAndFocus('accounts-heading');
  }
  useHashSection(ADMIN_HASHES, goToSection, list.status === 'ready');

  function body(): ReactNode {
    if (lostAccess) return <p role="alert" className={styles.notice}>You no longer have Admin access.</p>;

    return (
      <>
        {demo && (
          <p role="note" className={styles.notice}>
            Admin demo: the people and invitations here are fictional. Nothing is emailed and no real account changes.
          </p>
        )}
        {notice && <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Banner>}
        <Card as="section" className={styles.section} aria-labelledby="invite-heading">
          <h2 id="invite-heading" tabIndex={-1} className={styles.heading}>Invite someone</h2>
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
              <h2 id="accounts-heading" tabIndex={-1} className={styles.heading}>Users</h2>
              <AccountList accounts={list.data.accounts} currentUserId={currentUserId} busy={busy} onToggleRole={toggleRole} onToggleActive={toggleActive} />
            </Card>
          </>
        )}
      </>
    );
  }

  return (
    <AppShell account={account} onNavigate={goToSection}>
      <main className={styles.page}>
        <div className={styles.content}>
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
    </AppShell>
  );
}
