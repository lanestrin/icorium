import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Cloud, FileSpreadsheet, FolderDown, Info, Lock, Mail, Play, Shield, User, UserPlus } from 'lucide-react';
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
import { ExportBrowserFilesModal } from '../components/modals/ExportBrowserFilesModal';
import { Button } from '../components/ui/Button';
import { useAccount } from '../hooks/useAccount';
import { useRedirectResult } from '../hooks/useRedirectResult';
import { authErrorMessage, NOT_SET_UP_MESSAGE } from '../lib/auth';
import { createBrowserExport } from '../lib/browser-export';
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_STORAGE_MESSAGE, isDemoCredentials, startDemo } from '../lib/demo';
import { getSupabase } from '../lib/supabase';
import { PAGES } from '../lib/pages';

const FEATURES = [
  { icon: <UserPlus aria-hidden />, title: 'Admin invitations', text: 'Member is the default role, and invitations expire after 30 days.' },
  { icon: <Cloud aria-hidden />, title: 'Private workspace', text: 'Files and results are saved privately to your account and open on any device where you sign in.' },
  { icon: <Play aria-hidden />, title: 'Demo access', text: 'Try the workspace with sample files, no account needed.' },
  { icon: <Shield aria-hidden />, title: 'Role-based access', text: 'Admin is the only role that can manage invitations and accounts.' },
];

/**
 * /sign-in: email and password, or Google (build-plan 17.2b), in the two-column layout of 17.8. Protected
 * pages send signed-out visitors here (17.6). Try Demo fills the public demo credentials; the guest then presses Sign In, which starts an
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
  const [demoFilled, setDemoFilled] = useState(false); // the demo details are still in the fields
  const [offerExport, setOfferExport] = useState(false); // this browser has older files, or couldn't be read
  const [exporting, setExporting] = useState(false);
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
    setDemoFilled(true);
    setDemoFills((count) => count + 1);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (isDemoCredentials(email, password)) {
      try {
        startDemo(); // this tab's own temporary workspace; no account is involved
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : DEMO_STORAGE_MESSAGE);
        return;
      }
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

  // Offer the older files kept in this browser (read-only). A failed look still offers them: the dialog explains and retries.
  useEffect(() => {
    if (!showTryDemo) return;
    let cancelled = false;
    createBrowserExport().list().then(
      (files) => { if (!cancelled) setOfferExport(files.length > 0); },
      () => { if (!cancelled) setOfferExport(true); },
    );
    return () => { cancelled = true; };
  }, [showTryDemo]);

  return (
    <div className={page.shell}>
      <main className={layout.page}>
        <div className={layout.content}>
          <header className={layout.topBar}>
            <div className={layout.brand}>
              <a href="/" className={layout.brandName}>CSV Files</a>
              <span className={layout.tagline}>Secure access for refrigerant file workspace</span>
            </div>
            <AppVersion />
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
              {account.status === 'demo' && (
                <p className={styles.notice}>A demo is open in this tab. <a href="/">Go to CSV Files</a></p>
              )}
              {account.status === 'signed-in' && (
                <p className={styles.notice}>
                  You're signed in as {account.profile?.name || account.email}. <a href="/">Go to CSV Files</a>
                </p>
              )}
              {showForm && (
                <>
                  {error && <Banner tone="error">{error}</Banner>}
                  <form ref={form} className={styles.form} onSubmit={(event) => void signIn(event)}>
                    <AuthField label="Email" hideLabel placeholder="Email address" icon={<Mail />} type="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); setDemoFilled(false); }} />
                    <AuthField label="Password" hideLabel placeholder="Password" icon={<Lock />} revealable type="password" autoComplete="current-password" required value={password} onChange={(e) => { setPassword(e.target.value); setDemoFilled(false); }} />
                    <a href={PAGES.resetPassword} className={layout.forgot}>Forgot password?</a>
                    <Button type="submit" loading={signingIn}>{signingIn ? 'Signing in…' : 'Sign In'}</Button>
                  </form>
                  {account.status !== 'unconfigured' && <GoogleButton onError={setError} />}
                </>
              )}
              {showTryDemo && (
                <button type="button" className={layout.demo} onClick={fillDemo}><Play aria-hidden /> Try Demo</button>
              )}
              {/* Always mounted, so a screen reader announces the text when it appears. */}
              <p role="status" className={demoFilled ? styles.notice : styles.hiddenLabel}>{demoFilled ? 'Demo details filled in. Press Sign In to start the demo.' : ''}</p>
              <a href={PAGES.activate} className={layout.invitation}>Use invitation link</a>
              <p className={layout.expiry}>Invitations expire after 30 days unless an admin extends them.</p>
              {showTryDemo && offerExport && (
                <Button variant="link" className={layout.export} icon={<FolderDown />} onClick={() => setExporting(true)}>Export files kept in this browser</Button>
              )}
              <hr className={layout.divider} />
              <p className={layout.access}><User aria-hidden /> <span><strong>Need access?</strong> Contact your administrator for an invitation.</span></p>
            </Card>
          </div>
        </div>
      </main>
      {showTryDemo && exporting && <ExportBrowserFilesModal onClose={() => setExporting(false)} />}
    </div>
  );
}
