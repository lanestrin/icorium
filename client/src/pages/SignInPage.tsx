import { useState, type FormEvent } from 'react';
import { AuthField } from '../components/auth/AuthField';
import { AuthLayout, NotSetUp } from '../components/auth/AuthLayout';
import { GoogleButton } from '../components/auth/GoogleButton';
import styles from '../components/auth/auth.module.scss';
import { Banner } from '../components/Banner';
import { Button } from '../components/ui/Button';
import { useAccount } from '../hooks/useAccount';
import { authErrorMessage, NOT_SET_UP_MESSAGE } from '../lib/auth';
import { getSupabase } from '../lib/supabase';
import { PAGES } from '../lib/pages';

/**
 * /sign-in: email and password, or Google (build-plan 17.2b). No link leads here until 17.6.
 * onSignedIn opens the file workspace; tests pass their own.
 */
export function SignInPage({ onSignedIn = () => window.location.assign('/') }: { onSignedIn?: () => void }) {
  const { account } = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      const supabase = await getSupabase();
      const { error: failure } = (await supabase?.auth.signInWithPassword({ email: email.trim(), password })) ?? { error: null };
      if (!failure) {
        onSignedIn();
        return;
      }
      setError(authErrorMessage(failure));
    } catch (failure) {
      setError(authErrorMessage(failure));
    }
    setSigningIn(false);
  }

  return (
    <AuthLayout title="Sign in" intro="Use the account you activated from your invitation.">
      {account.status === 'unconfigured' && <NotSetUp message={NOT_SET_UP_MESSAGE} />}
      {account.status === 'loading' && <p role="status" className={styles.notice}>Checking whether you're signed in…</p>}
      {account.status === 'signed-in' && (
        <p className={styles.notice}>
          You're signed in as {account.profile?.name || account.email}. <a href="/">Go to CSV Files</a>
        </p>
      )}
      {(account.status === 'signed-out' || account.status === 'error') && (
        <div className={styles.form}>
          {error && <Banner tone="error">{error}</Banner>}
          <form className={styles.form} onSubmit={(event) => void signIn(event)}>
            <AuthField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <AuthField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" loading={signingIn}>{signingIn ? 'Signing in…' : 'Sign in'}</Button>
          </form>
          <p className={styles.divider}>or</p>
          <GoogleButton onError={setError} />
          <div className={styles.links}>
            <a href={PAGES.resetPassword}>Forgot password?</a>
            <a href={PAGES.activate}>Have an invitation? Activate your account</a>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
