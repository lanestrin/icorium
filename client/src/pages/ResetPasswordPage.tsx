import { useState, type FormEvent } from 'react';
import { AuthField } from '../components/auth/AuthField';
import { AuthLayout, NotSetUp } from '../components/auth/AuthLayout';
import styles from '../components/auth/auth.module.scss';
import { Banner } from '../components/Banner';
import { Button } from '../components/ui/Button';
import { useAccount } from '../hooks/useAccount';
import { useRedirectResult } from '../hooks/useRedirectResult';
import { authErrorMessage, NOT_SET_UP_MESSAGE, redirectUrl } from '../lib/auth';
import { getSupabase } from '../lib/supabase';
import { PAGES } from '../lib/pages';

/**
 * /reset-password (build-plan 17.2b). First it asks for the address and emails a reset link. Opened from
 * that link, Supabase finishes the PKCE redirect and reports PASSWORD_RECOVERY (auth-js 2.118: the code
 * verifier saved by resetPasswordForEmail is tagged as a recovery), and the page asks for the new
 * password. The verifier lives in this browser, so the link has to be opened in the same browser.
 */
export function ResetPasswordPage() {
  const { account, recovering } = useAccount();
  // An expired or already-used reset link comes back with an error; show it above the request form.
  const redirect = useRedirectResult();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(redirect.error);
  const [done, setDone] = useState<'sent' | 'changed' | null>(null);

  async function run(action: () => Promise<{ error: unknown } | undefined>, outcome: 'sent' | 'changed') {
    setError(null);
    setBusy(true);
    try {
      const { error: failure } = (await action()) ?? { error: null };
      if (!failure) {
        setDone(outcome);
        return;
      }
      setError(authErrorMessage(failure));
    } catch (failure) {
      setError(authErrorMessage(failure));
    }
    setBusy(false);
  }

  function sendLink(event: FormEvent) {
    event.preventDefault();
    // Supabase answers the same way for an address with no account, so the result never reveals one.
    void run(async () => (await getSupabase())?.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl('/reset-password') }), 'sent');
  }

  function setNewPassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => (await getSupabase())?.auth.updateUser({ password }), 'changed');
  }

  const setMode = recovering && account.status === 'signed-in';
  return (
    <AuthLayout title={setMode || done === 'changed' ? 'Set a new password' : 'Reset your password'}>
      {account.status === 'unconfigured' && <NotSetUp message={NOT_SET_UP_MESSAGE} />}
      {done === 'sent' && (
        <p role="status" className={styles.notice}>
          If an account uses that address, we've sent a link. Open it in this browser to choose a new password.
        </p>
      )}
      {done === 'changed' && (
        <p role="status" className={styles.notice}>
          Password changed. <a href="/">Go to CSV Files</a>
        </p>
      )}
      {account.status === 'loading' && !done && <p role="status" className={styles.notice}>Loading…</p>}
      {account.status !== 'unconfigured' && account.status !== 'loading' && !done && (
        <div className={styles.form}>
          {error && <Banner tone="error">{error}</Banner>}
          {setMode ? (
            <form className={styles.form} onSubmit={setNewPassword}>
              <AuthField label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="submit" loading={busy}>{busy ? 'Saving…' : 'Set new password'}</Button>
            </form>
          ) : (
            <form className={styles.form} onSubmit={sendLink}>
              <AuthField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button type="submit" loading={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
            </form>
          )}
          <div className={styles.links}>
            <a href={PAGES.signIn}>Back to sign in</a>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
