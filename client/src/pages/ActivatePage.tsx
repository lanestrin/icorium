import { useRef, useState, type FormEvent } from 'react';
import { AuthField } from '../components/auth/AuthField';
import { AuthLayout, NotSetUp } from '../components/auth/AuthLayout';
import { GoogleButton } from '../components/auth/GoogleButton';
import styles from '../components/auth/auth.module.scss';
import { Banner } from '../components/Banner';
import { Button } from '../components/ui/Button';
import { authErrorMessage, cleanName, NAME_MAX, NOT_SET_UP_MESSAGE, redirectUrl } from '../lib/auth';
import { getSupabase, isAuthConfigured } from '../lib/supabase';
import { PAGES } from '../lib/pages';

/**
 * /activate: an invited person creates their account with a name and password, or with Google
 * (build-plan 17.2b). The sign-up hook refuses any address without a pending invitation (17.2a); the
 * account gets its profile and role only once the confirmation link proves the address is theirs.
 */
export function ActivatePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sent, setSent] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const cleanedName = cleanName(name);
    if (!cleanedName) {
      setNameError(`Enter your name (up to ${NAME_MAX} characters).`);
      nameField.current?.focus();
      return;
    }
    setCreating(true);
    try {
      const supabase = await getSupabase();
      const { error: failure } = (await supabase?.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: cleanedName }, emailRedirectTo: redirectUrl('/sign-in') },
      })) ?? { error: null };
      // Supabase answers an address that already has an account like a new one, so the same message
      // shows either way and nothing reveals who has an account.
      if (!failure) {
        setSent(true);
        return;
      }
      setError(authErrorMessage(failure));
    } catch (failure) {
      setError(authErrorMessage(failure));
    }
    setCreating(false);
  }

  return (
    <AuthLayout title="Activate your account" intro="Use the email address your invitation was sent to.">
      {!isAuthConfigured() && <NotSetUp message={NOT_SET_UP_MESSAGE} />}
      {isAuthConfigured() && sent && (
        <p role="status" className={styles.notice}>
          Check your email to confirm your address, then <a href={PAGES.signIn}>sign in</a>.
        </p>
      )}
      {isAuthConfigured() && !sent && (
        <div className={styles.form}>
          {error && <Banner tone="error">{error}</Banner>}
          <form className={styles.form} onSubmit={(event) => void create(event)}>
            <AuthField
              ref={nameField}
              label="Name"
              autoComplete="name"
              hint={`Up to ${NAME_MAX} characters.`}
              value={name}
              error={nameError}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
            />
            <AuthField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <AuthField label="Password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" loading={creating}>{creating ? 'Creating account…' : 'Create account'}</Button>
          </form>
          <p className={styles.divider}>or</p>
          <GoogleButton onError={setError} />
          <div className={styles.links}>
            <a href={PAGES.signIn}>Already activated? Sign in</a>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
