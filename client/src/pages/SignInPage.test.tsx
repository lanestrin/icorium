import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVITE_ONLY_MESSAGE } from '../lib/auth';
import { currentDemoId, DEMO_EMAIL, DEMO_PASSWORD, DEMO_STORAGE_MESSAGE, startDemo } from '../lib/demo';
import { createBrowserExport } from '../lib/browser-export';
import { getSupabase, isAuthConfigured } from '../lib/supabase';
import { fakeSession, fakeSupabase } from '../test-fixtures/fake-supabase';
import { SignInPage } from './SignInPage';

vi.mock('../lib/supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn(() => true) }));

vi.mock('../lib/browser-export', () => ({ createBrowserExport: vi.fn() }));

const list = vi.fn();
const read = vi.fn();
beforeEach(() => {
  list.mockReset().mockResolvedValue([]);
  vi.mocked(createBrowserExport).mockReturnValue({ list, read });
});

function setUp(options: Parameters<typeof fakeSupabase>[0] = {}) {
  const fake = fakeSupabase(options);
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  return fake;
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), ' ada@example.com ');
  await user.type(screen.getByLabelText('Password'), 'correct horse');
  await user.click(screen.getByRole('button', { name: 'Sign In' }));
}

afterEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.mocked(isAuthConfigured).mockReturnValue(true);
  window.history.replaceState(null, '', '/');
});

describe('SignInPage', () => {
  it('explains a refused Google sign-up from the redirect, then cleans the address', async () => {
    setUp();
    window.history.replaceState(null, '', `/sign-in?error=server_error&error_description=${encodeURIComponent(INVITE_ONLY_MESSAGE)}`);
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(INVITE_ONLY_MESSAGE);
    expect(window.location.pathname + window.location.search).toBe('/sign-in');
  });

  it('explains an expired confirmation link', async () => {
    setUp();
    window.history.replaceState(null, '', '/sign-in#error=access_denied&error_code=otp_expired');
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired or was already used. Ask for a new one.');
    expect(window.location.hash).toBe('');
  });

  it('opens the file workspace once a Google or confirmation redirect has signed the person in', async () => {
    setUp({ session: fakeSession(), profile: { name: 'Ada', role: 'Member', active: true } });
    window.history.replaceState(null, '', '/sign-in?code=abc');
    const onSignedIn = vi.fn();
    render(<SignInPage onSignedIn={onSignedIn} />);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
  });

  it('stays on the page for a person who opens it while already signed in', async () => {
    setUp({ session: fakeSession(), profile: { name: 'Ada', role: 'Member', active: true } });
    const onSignedIn = vi.fn();
    render(<SignInPage onSignedIn={onSignedIn} />);
    expect(await screen.findByText(/You're signed in as Ada/)).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('signs in with email and password, then opens the file workspace', async () => {
    const fake = setUp();
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={onSignedIn} />);
    await fillAndSubmit(user);
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correct horse' });
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });

  it('submits with Enter', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await user.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'pw{Enter}');
    await waitFor(() => expect(fake.auth.signInWithPassword).toHaveBeenCalled());
  });

  it('says when the email or password is wrong, keeping what was typed', async () => {
    const fake = setUp();
    fake.auth.signInWithPassword.mockResolvedValueOnce({ error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400 } });
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={onSignedIn} />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    // An email input drops surrounding spaces from its value, as browsers do.
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
    expect(screen.getByLabelText('Password')).toHaveValue('correct horse');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('asks an unconfirmed account to confirm its email', async () => {
    const fake = setUp();
    fake.auth.signInWithPassword.mockResolvedValueOnce({ error: { name: 'AuthApiError', code: 'email_not_confirmed', status: 400 } });
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirm your email address first.');
  });

  it('reports a network failure as temporarily unavailable', async () => {
    const fake = setUp();
    fake.auth.signInWithPassword.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is temporarily unavailable. Try again later.');
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  it('disables the button while signing in', async () => {
    const fake = setUp();
    fake.auth.signInWithPassword.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await fillAndSubmit(user);
    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });

  it('starts Google sign-in back to this page', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/sign-in` } });
  });

  it('shows a Google error', async () => {
    const fake = setUp();
    fake.auth.signInWithOAuth.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
  });

  it('links to password recovery and activation', async () => {
    setUp();
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/reset-password');
    expect(screen.getByRole('link', { name: 'Use invitation link' })).toHaveAttribute('href', '/activate');
  });

  it('tells a signed-in person who they are signed in as', async () => {
    setUp({ session: fakeSession(), profile: { name: 'Ada', role: 'Member', active: true } });
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByText(/You're signed in as Ada/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('says sign-in is not set up on a site without Supabase settings', () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(screen.getByText("Sign-in isn't set up on this site yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('shows what the workspace offers and the privacy note', async () => {
    setUp();
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to your workspace' })).toBeInTheDocument();
    for (const title of ['Admin invitations', 'Private workspace', 'Demo access', 'Role-based access']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText(/Admins cannot read members' file contents/)).toBeInTheDocument();
    expect(screen.queryByText(/stay in this browser for now/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /CSV Generator/ })).not.toBeInTheDocument(); // Admin pages (17.6)
    expect(screen.queryByRole('link', { name: /Architecture/ })).not.toBeInTheDocument();
  });

  it('offers the invitation link, the expiry note and no remember-me', async () => {
    setUp();
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Try Demo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use invitation link' })).toHaveAttribute('href', '/activate');
    expect(screen.getByText(/Invitations expire after 30 days/)).toBeInTheDocument();
    expect(screen.getByText(/Need access\?/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/remember me/i)).not.toBeInTheDocument();
  });

  it('fills the public demo credentials, announces it and focuses Sign In', async () => {
    setUp();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Try Demo' }));
    expect(screen.getByLabelText('Email')).toHaveValue(DEMO_EMAIL);
    expect(screen.getByLabelText('Password')).toHaveValue(DEMO_PASSWORD);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Demo details filled in. Press Sign In to start the demo.');
    expect(screen.getByRole('button', { name: 'Sign In' })).toHaveFocus();
  });

  it('starts an isolated demo only when the guest submits the demo credentials, without calling Supabase', async () => {
    const fake = setUp();
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={onSignedIn} />);
    await user.click(await screen.findByRole('button', { name: 'Try Demo' }));
    expect(currentDemoId()).toBeNull(); // filling the form starts nothing
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(currentDemoId()).not.toBeNull();
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('says so, and starts nothing, when the browser blocks the storage the demo needs', async () => {
    setUp();
    const blocked = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    try {
      const onSignedIn = vi.fn();
      const user = userEvent.setup();
      render(<SignInPage onSignedIn={onSignedIn} />);
      await user.click(await screen.findByRole('button', { name: 'Try Demo' }));
      await user.click(screen.getByRole('button', { name: 'Sign In' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(DEMO_STORAGE_MESSAGE);
      expect(onSignedIn).not.toHaveBeenCalled();
    } finally { blocked.mockRestore(); }
  });

  it('clears the demo announcement once either field is edited', async () => {
    setUp();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Try Demo' }));
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Demo details filled in.');
    await user.type(screen.getByLabelText('Email'), 'x');
    expect(screen.getByRole('status', { name: '' })).toBeEmptyDOMElement();
  });

  it('tells a tab that already has a demo open where to go, instead of an empty card', async () => {
    setUp();
    startDemo();
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByText(/A demo is open in this tab/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to CSV Files' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Try Demo' })).not.toBeInTheDocument();
  });

  it('does not start a demo for other credentials', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await fillAndSubmit(user);
    expect(fake.auth.signInWithPassword).toHaveBeenCalled();
    expect(currentDemoId()).toBeNull();
  });

  it('on a site without sign-in settings, Try Demo reveals the form and other credentials are refused', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={onSignedIn} />);
    expect(screen.getByText("Sign-in isn't set up on this site yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try Demo' }));
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument(); // it could only spin
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Sign-in isn't set up on this site yet.");
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(getSupabase).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Try Demo' }));
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('hides Try Demo while the account loads and when someone is already signed in', async () => {
    setUp({ session: fakeSession(), profile: { name: 'Ada', role: 'Member', active: true } });
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Try Demo' })).not.toBeInTheDocument();
    expect(await screen.findByText(/You're signed in as Ada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Demo' })).not.toBeInTheDocument();
  });

  it('shows and hides the password without submitting', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    const password = await screen.findByLabelText('Password');
    await user.type(password, 'secret');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('SignInPage: files kept in this browser', () => {
  const FILE = { id: '100001', name: 'older.csv', rows: 2, columns: 3, uploadedAt: '2026-01-01T00:00:00.000Z', status: 'Ready' };
  const exportButton = { name: 'Export files kept in this browser' };

  it('offers the export when there are files, opens the list, and returns focus when closed, calling no Supabase service', async () => {
    const fake = setUp();
    list.mockResolvedValue([FILE]);
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    const button = await screen.findByRole('button', exportButton);
    await user.click(button);
    expect(await screen.findByRole('dialog', { name: "Export this browser's files" })).toHaveTextContent('older.csv');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
    expect(fake.maybeSingle).not.toHaveBeenCalled();
    expect(fake.invoke).not.toHaveBeenCalled();
    expect(fake.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('offers nothing when the browser has no files', async () => {
    setUp();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await screen.findByLabelText('Email');
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.queryByRole('button', exportButton)).not.toBeInTheDocument();
  });

  it('offers the export when the look failed, so the dialog can explain and try again', async () => {
    setUp();
    list.mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce(new Error('boom')).mockResolvedValue([FILE]);
    const user = userEvent.setup();
    render(<SignInPage onSignedIn={vi.fn()} />);
    await user.click(await screen.findByRole('button', exportButton));
    const dialog = await screen.findByRole('dialog');
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(dialog).toHaveTextContent('older.csv'));
  });

  it('offers it on a site without sign-in and when the account read failed', async () => {
    list.mockResolvedValue([FILE]);
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    const first = render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('button', exportButton)).toBeInTheDocument();
    first.unmount();

    vi.mocked(isAuthConfigured).mockReturnValue(true);
    setUp({ session: fakeSession(), profileError: { message: 'boom' } });
    render(<SignInPage onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('button', exportButton)).toBeInTheDocument();
  });

  it('does not look for files for someone who is signed in', async () => {
    setUp({ session: fakeSession(), profile: { name: 'Ada', role: 'Member', active: true } });
    list.mockResolvedValue([FILE]);
    render(<SignInPage onSignedIn={vi.fn()} />);
    await screen.findByText(/You're signed in as Ada/);
    expect(list).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', exportButton)).not.toBeInTheDocument();
  });
});
