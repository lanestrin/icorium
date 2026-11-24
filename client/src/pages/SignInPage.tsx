import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FolderDown, Lock, Mail, Play, User } from 'lucide-react';
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
import { DEMO_EMAIL, DEMO_ENDED_PARAM, DEMO_PASSWORD, DEMO_STORAGE_MESSAGE, isDemoCredentials, leaveDemo, startDemo } from '../lib/demo';
import { getSupabase } from '../lib/supabase';
import { PAGES } from '../lib/pages';

/**
 * /sign-in: email and password, or Google (build-plan 17.2b), in one centered card. Protected
 * pages send signed-out visitors here (17.6). Try Demo fills the public demo credentials; the guest then presses Sign In, which starts an
 * isolated temporary demo (17.5) without calling Supabase. After a demo is signed out, the details are
 * already filled in. On a site without Supabase settings the form only starts the demo.
 * Google and email-confirmation redirects come back here: a failed one shows its message, and a
 * successful one opens the file workspace. Signing in to an account leaves a demo open in this tab; just opening
 * this page does not. onSignedIn opens it; tests pass their own.
 */
export function SignInPage({ onSignedIn = () => window.location.assign('/') }: { onSignedIn?: () => void }) {
  const { account, hasSession, signOut } = useAccount();
  const redirect = useRedirectResult();
  const [demoEnded] = useState(() => new URLSearchParams(window.location.search).has(DEMO_ENDED_PARAM));
  const [email, setEmail] = useState(demoEnded ? DEMO_EMAIL : '');
  const [password, setPassword] = useState(demoEnded ? DEMO_PASSWORD : '');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(redirect.error);
  const [demoFills, setDemoFills] = useState(demoEnded ? 1 : 0); // counts Try Demo presses, so each one refocuses Sign In
  const [demoFilled, setDemoFilled] = useState(demoEnded); // the demo details are still in the fields
  const [offerExport, setOfferExport] = useState(false); // this browser has older files, or couldn't be read
  const [exporting, setExporting] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  // Back from Google or a confirmation link with a session: go straight to the files, leaving any open demo. Supabase
  // removes ?code= once it has exchanged it, so a code still in the address never signed anyone in here.
  const signedInByRedirect = redirect.fromRedirect && !redirect.error && hasSession && !new URLSearchParams(window.location.search).has('code');
  // Runs once when the redirect's session arrives; onSignedIn is left out so a new default function on
  // each render doesn't open the files twice.
  useEffect(() => {
    if (signedInByRedirect) void leaveDemo().then(onSignedIn);
  }, [signedInByRedirect]);

  // The sign-in form and Try Demo show together.
  const showForm = account.status === 'signed-out' || account.status === 'error' || account.status === 'unconfigured';

  // Drops the marker, so a reload or a kept address starts with empty fields.
  useEffect(() => {
    if (!demoEnded) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(DEMO_ENDED_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [demoEnded]);

  // Once the demo details are in the fields, focus Sign In so the guest only has to press it.
  useEffect(() => {
    if (showForm && demoFills > 0) form.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  }, [showForm, demoFills]);

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
        await leaveDemo(); // a demo started before the browser went Back to this page
        onSignedIn();
        return;
      }
      setError(authErrorMessage(failure));
    } catch (failure) {
      setError(authErrorMessage(failure));
    }
    setSigningIn(false);
  }

  // Invitations and password recovery need accounts; a site without Supabase settings offers just the demo.
  const showAccountHelp = account.status === 'signed-out' || account.status === 'error';

  // Offer the older files kept in this browser (read-only). A failed look still offers them: the dialog explains and retries.
  useEffect(() => {
    if (!showForm) return;
    let cancelled = false;
    createBrowserExport().list().then(
      (files) => { if (!cancelled) setOfferExport(files.length > 0); },
      () => { if (!cancelled) setOfferExport(true); },
    );
    return () => { cancelled = true; };
  }, [showForm]);

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
          <Card className={classNames(styles.form, layout.signInCard)}>
            <div>
              <h1 className={layout.welcome}>Welcome back</h1>
              <p className={page.intro}>{account.status === 'unconfigured' ? 'Try the demo with sample files.' : 'Sign in with your invited account or try the demo.'}</p>
            </div>
            {account.status === 'unconfigured' && <NotSetUp message={NOT_SET_UP_MESSAGE} />}
            {account.status === 'loading' && <p role="status" className={styles.notice}>Checking whether you're signed in…</p>}
            {account.status === 'demo' && (
              <>
                {error && <Banner tone="error">{error}</Banner>}
                <p className={styles.notice}>A demo is open in this tab. <a href="/" className={layout.filesLink}>Go to CSV Files</a></p>
                <Button variant="outline" onClick={() => void signOut()}>Sign out of demo</Button>
                <p className={layout.expiry}>Signing out deletes the demo's files. You can then sign in to your account.</p>
              </>
            )}
            {account.status === 'signed-in' && (
              <p className={styles.notice}>
                You're signed in as {account.profile?.name || account.email}. <a href="/" className={layout.filesLink}>Go to CSV Files</a>
              </p>
            )}
            {showForm && (
              <>
                {error && <Banner tone="error">{error}</Banner>}
                <form ref={form} className={styles.form} onSubmit={(event) => void signIn(event)}>
                  <AuthField label="Email" hideLabel placeholder="Email address" icon={<Mail />} type="email" autoComplete="email" required value={email} onChange={(e) => { setEmail(e.target.value); setDemoFilled(false); }} />
                  <AuthField label="Password" hideLabel placeholder="Password" icon={<Lock />} revealable type="password" autoComplete="current-password" required value={password} onChange={(e) => { setPassword(e.target.value); setDemoFilled(false); }} />
                  {showAccountHelp && <a href={PAGES.resetPassword} className={layout.forgot}>Forgot password?</a>}
                  <Button type="submit" loading={signingIn}>{signingIn ? 'Signing in…' : 'Sign In'}</Button>
                </form>
                {account.status !== 'unconfigured' && <GoogleButton onError={setError} />}
              </>
            )}
            {showForm && (
              <button type="button" className={layout.demo} onClick={fillDemo}><Play aria-hidden /> Try Demo</button>
            )}
            {/* Always mounted, so a screen reader announces the text when it appears. */}
            <p role="status" className={showForm && demoFilled ? styles.notice : styles.hiddenLabel}>{showForm && demoFilled ? 'Demo details filled in. Press Sign In to start the demo.' : ''}</p>
            {showAccountHelp && (
              <>
                <a href={PAGES.activate} className={layout.invitation}>Use invitation link</a>
                <p className={layout.expiry}>Invitations expire after 30 days unless an admin extends them.</p>
              </>
            )}
            {showForm && offerExport && (
              <Button variant="link" className={layout.export} icon={<FolderDown />} onClick={() => setExporting(true)}>Export files kept in this browser</Button>
            )}
            {showAccountHelp && (
              <>
                <hr className={layout.divider} />
                <p className={layout.access}><User aria-hidden /> <span><strong>Need access?</strong> Contact your administrator for an invitation.</span></p>
              </>
            )}
          </Card>
        </div>
      </main>
      {showForm && exporting && <ExportBrowserFilesModal onClose={() => setExporting(false)} />}
    </div>
  );
}
