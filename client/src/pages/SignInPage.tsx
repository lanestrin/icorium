import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Cloud, FileSpreadsheet, Info, Lock, Mail, Network, Play, Shield, User, UserPlus, Wand2 } from 'lucide-react';
import { AuthField } from '../components/auth/AuthField';
import { NotSetUp } from '../components/auth/AuthLayout';
import { GoogleButton } from '../components/auth/GoogleButton';
import styles from '../components/auth/auth.module.scss';
import layout from '../components/auth/signin.module.scss';
import page from '../styles/page.module.scss';
import { AppVersion } from '../components/AppVersion';
import { Card } from '../components/ui/Card';
import { classNames } from '../lib/class-names';
import { Banner } from '../components/Banner';
import { Button } from '../components/ui/Button';
import { useAccount } from '../hooks/useAccount';
import { useRedirectResult } from '../hooks/useRedirectResult';
import { authErrorMessage, NOT_SET_UP_MESSAGE } from '../lib/auth';
import { DEMO_EMAIL, DEMO_PASSWORD, isDemoCredentials, startDemo } from '../lib/demo';
import { getSupabase } from '../lib/supabase';
import { PAGES } from '../lib/pages';

const FEATURES = [
  { icon: <UserPlus aria-hidden />, title: 'Admin invitations', text: 'Member is the default role, and invitations expire after 30 days.' },
  { icon: <Cloud aria-hidden />, title: 'Private workspace', text: 'Files and results stay in this browser for now; private cross-device files are coming.' },
  { icon: <Play aria-hidden />, title: 'Demo access', text: 'Try the workspace with sample files, no account needed.' },
  { icon: <Shield aria-hidden />, title: 'Role-based access', text: 'Admin is the only role that can manage invitations and accounts.' },
];

/**
 * /sign-in: email and password, or Google (build-plan 17.2b), in the two-column layout of 17.8. No link
 * leads here until 17.6. Try Demo fills the public demo credentials; the guest then presses Sign In, which starts an
 * isolated temporary demo (17.5) without calling Supabase. On a site without Supabase settings Try Demo also shows the form.
 * Google and email-confirmation redirects come back here: a failed one shows its message, and a
 * successful one opens the file workspace. onSignedIn opens it; tests pass their own.
 */
export function SignInPage({ onSignedIn = () => window.location.assign('/') }: { onSignedIn?: () => void }) {
  const { account } = useAccount();
  const redirect = useRedirectResult();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(redirect.error);
  const [demoFills, setDemoFills] = useState(0); // counts Try Demo presses, so each one refocuses Sign In
  const form = useRef<HTMLFormElement>(null);

  // Back from Google or a confirmation link with a session: go straight to the files.
  const signedInByRedirect = redirect.fromRedirect && account.status === 'signed-in';
  // Runs once when the redirect's session arrives; onSignedIn is left out so a new default function on
  // each render doesn't open the files twice.
  useEffect(() => {
    if (signedInByRedirect) onSignedIn();
  }, [signedInByRedirect]);

  // After Try Demo has filled the fields, focus Sign In so the guest only has to press it.
  useEffect(() => {
    if (demoFills > 0) form.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  }, [demoFills]);

  function fillDemo() {
    setError(null);
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setDemoFills((count) => count + 1);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (isDemoCredentials(email, password)) {
      startDemo(); // this tab's own temporary workspace; no account is involved
      onSignedIn();
      return;
    }
    if (account.status === 'unconfigured') {
      setError(NOT_SET_UP_MESSAGE);
      return;
    }
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

  const showForm = account.status === 'signed-out' || account.status === 'error' || (account.status === 'unconfigured' && demoFills > 0);
  const showTryDemo = account.status === 'signed-out' || account.status === 'error' || account.status === 'unconfigured';

  return (
    <div className={page.shell}>
      <main className={layout.page}>
        <div className={layout.content}>
          <header className={layout.topBar}>
            <div className={layout.brand}>
              <a href="/" className={layout.brandName}>CSV Files</a>
              <span className={layout.tagline}>Secure access for refrigerant file workspace</span>
            </div>
            <nav aria-label="Pages" className={page.nav}>
              <a href={PAGES.generator} className={page.navLink}><Wand2 aria-hidden /> CSV Generator</a>
              <a href={PAGES.architecture} className={page.navLink}><Network aria-hidden /> Architecture</a>
              <AppVersion />
            </nav>
          </header>
          <div className={layout.columns}>
            <Card className={layout.panel}>
              <div className={layout.intro}>
                <div>
                  <h1 className={page.title}>Sign in to your workspace</h1>
                  <p className={page.intro}>This workspace lets invited users securely access files, processing, and results.</p>
                </div>
                <span className={layout.illustration} aria-hidden><FileSpreadsheet /></span>
              </div>
              <ul className={layout.features}>
                {FEATURES.map((feature) => (
                  <li key={feature.title} className={layout.feature}>
                    <span className={layout.featureIcon}>{feature.icon}</span>
                    <div>
                      <strong className={layout.featureTitle}>{feature.title}</strong>
                      <span className={layout.featureText}>{feature.text}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className={layout.note}><Info aria-hidden /> File privacy is preserved. Admins cannot read members' file contents.</p>
            </Card>
            <Card className={classNames(styles.form, layout.signInCard)}>
              <div>
                <h2 className={layout.welcome}>Welcome back</h2>
                <p className={page.intro}>Sign in with your invited account or try the demo.</p>
              </div>
              {account.status === 'unconfigured' && <NotSetUp message={NOT_SET_UP_MESSAGE} />}
              {account.status === 'loading' && <p role="status" className={styles.notice}>Checking whether you're signed in…</p>}
              {account.status === 'signed-in' && (
                <p className={styles.notice}>
                  You're signed in as {account.profile?.name || account.email}. <a href="/">Go to CSV Files</a>
                </p>
              )}
              {showForm && (
                <>
                  {error && <Banner tone="error">{error}</Banner>}
                  <form ref={form} className={styles.form} onSubmit={(event) => void signIn(event)}>
                    <AuthField label="Email" hideLabel placeholder="Email address" icon={<Mail />} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    <AuthField label="Password" hideLabel placeholder="Password" icon={<Lock />} revealable type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    <a href={PAGES.resetPassword} className={layout.forgot}>Forgot password?</a>
                    <Button type="submit" loading={signingIn}>{signingIn ? 'Signing in…' : 'Sign In'}</Button>
                  </form>
                  <GoogleButton onError={setError} />
                </>
              )}
              {showTryDemo && (
                <button type="button" className={layout.demo} onClick={fillDemo}><Play aria-hidden /> Try Demo</button>
              )}
              {demoFills > 0 && <p role="status" className={styles.notice}>Demo details filled in. Press Sign In to start the demo.</p>}
              <a href={PAGES.activate} className={layout.invitation}>Use invitation link</a>
              <p className={layout.expiry}>Invitations expire after 30 days unless an admin extends them.</p>
              <hr className={layout.divider} />
              <p className={layout.access}><User aria-hidden /> <span><strong>Need access?</strong> Contact your administrator for an invitation.</span></p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
