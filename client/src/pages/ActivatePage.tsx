import { useRef, useState, type FormEvent } from 'react';
import { AuthField } from '../components/auth/AuthField';
import { AuthLayout, NotSetUp } from '../components/auth/AuthLayout';
import { GoogleButton } from '../components/auth/GoogleButton';
import styles from '../components/auth/auth.module.scss';
import { Banner } from '../components/Banner';
import { Button } from '../components/ui/Button';
import { authErrorMessage, cleanName, INVITE_ONLY_MESSAGE, NAME_MAX, NOT_SET_UP_MESSAGE, redirectUrl } from '../lib/auth';
import { getSupabase, isAuthConfigured } from '../lib/supabase';
import { PAGES } from '../lib/pages';

/**
 * /activate: an invited person creates their account with a name and password, or with Google
 * (build-plan 17.2b). The sign-up hook refuses any address without a pending invitation (17.2a); the
 * account gets its profile and role only once the confirmation link proves the address is theirs.
 */
export function ActivatePage() {
  const [name, setName] = useState('');
  // An invitation email links to /activate?email=<address>; it only fills the field, the person can change it.
  const [email, setEmail] = useState(() => (new URLSearchParams(window.location.search).get('email') ?? '').trim().slice(0, 254));
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
      // One neutral answer whether the address was invited, already has an account (Supabase answers that
      // like a new sign-up) or was refused by the invite-only hook, so nobody can probe which addresses
      // are invited (F-35, decided 2026-11-19). Other problems, such as a weak password, still show.
      const message = failure ? authErrorMessage(failure) : null;
      if (!message || message === INVITE_ONLY_MESSAGE) {
        setSent(true);
        return;
      }
      setError(message);
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
          If this address has an invitation, check your email to confirm it, then <a href={PAGES.signIn}>sign in</a>.
          Nothing arrived? Ask an administrator for an invitation.
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
