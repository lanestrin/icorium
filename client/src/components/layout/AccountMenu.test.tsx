import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAccount, type Profile } from '../../hooks/useAccount';
import { getSupabase, isAuthConfigured } from '../../lib/supabase';
import { fakeSession, fakeSupabase } from '../../test-fixtures/fake-supabase';
import { AccountMenu, initials } from './AccountMenu';

vi.mock('../../lib/supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn(() => true) }));

/** The menu wired to the real hook, as a page wires it through AppShell. */
function Harness() {
  return <AccountMenu {...useAccount()} />;
}

function setUp(options: Parameters<typeof fakeSupabase>[0] = {}) {
  const fake = fakeSupabase(options);
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  return fake;
}
const signedIn = (profile: Profile | null) => setUp({ session: fakeSession(), profile });
const member: Profile = { name: 'Ada', role: 'Member', active: true };
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: /^Account menu/ }));

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthConfigured).mockReturnValue(true);
});

describe('initials', () => {
  it('uses the first letters of the first two words, else the email', () => {
    expect(initials('ada lovelace byron', 'x@example.com')).toBe('AL');
    expect(initials('Ada', 'x@example.com')).toBe('A');
    expect(initials('  ', 'zed@example.com')).toBe('Z');
    expect(initials(null, '')).toBe('');
  });
});

describe('AccountMenu', () => {
  it('shows nothing on a site without sign-in', () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    render(<Harness />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows nothing while the session loads', () => {
    setUp();
    render(<Harness />);
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('links to sign-in when signed out', async () => {
    setUp();
    render(<Harness />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
  });

  it('shows initials, and the name and role in the menu, with Sign out', async () => {
    signedIn({ ...member, name: 'Ada Lovelace', role: 'Admin' });
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = await screen.findByRole('button', { name: 'Account menu, Ada Lovelace · Admin' });
    expect(trigger).toHaveTextContent('AL');
    expect(screen.getByRole('status')).toHaveTextContent('Account: Ada Lovelace · Admin');
    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Ada Lovelace');
    expect(menu).toHaveTextContent('Admin');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('shows the email when the account has no name', async () => {
    signedIn({ ...member, name: null });
    render(<Harness />);
    expect(await screen.findByRole('button', { name: 'Account menu, ada@example.com · Member', hidden: true })).toHaveTextContent('A');
  });

  it('explains an account that is not activated yet', async () => {
    signedIn(null);
    const user = userEvent.setup();
    render(<Harness />);
    expect(await screen.findByRole('status')).toHaveTextContent('Account not active yet');
    await openMenu(user);
    expect(await screen.findByRole('menu')).toHaveTextContent('Account not active yet');
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('explains a deactivated account', async () => {
    signedIn({ ...member, active: false });
    render(<Harness />);
    expect(await screen.findByRole('status')).toHaveTextContent('Account deactivated');
  });

  it('announces a failed account read and still offers Sign out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setUp({ session: fakeSession(), profileError: { message: 'boom' } });
    const user = userEvent.setup();
    render(<Harness />);
    expect(await screen.findByRole('status')).toHaveTextContent('Something went wrong. Try again.');
    await openMenu(user);
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('renders the name as text, not markup', async () => {
    signedIn({ ...member, name: '<b>Ada</b>' });
    render(<Harness />);
    expect(await screen.findByRole('status')).toHaveTextContent('<b>Ada</b> · Member');
    expect(document.querySelector('b')).toBeNull();
  });

  it('signs out on this device', async () => {
    const fake = signedIn(member);
    const user = userEvent.setup();
    render(<Harness />);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows why sign-out failed', async () => {
    const fake = signedIn(member);
    fake.auth.signOut.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    const user = userEvent.setup();
    render(<Harness />);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
  });

  describe('name prompt', () => {
    it('asks a nameless active account for a name and saves it', async () => {
      const fake = signedIn({ ...member, name: null });
      const user = userEvent.setup();
      render(<Harness />);
      const dialog = await screen.findByRole('dialog', { name: 'What should we call you?' });
      await user.type(screen.getByLabelText('Name'), ' Ada Lovelace ');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(fake.update).toHaveBeenCalledWith({ name: 'Ada Lovelace' });
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      expect(screen.getByRole('status')).toHaveTextContent('Ada Lovelace · Member');
    });

    it('keeps the dialog open with the message when saving fails', async () => {
      const fake = signedIn({ ...member, name: null });
      fake.updateEq.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0 } });
      const user = userEvent.setup();
      render(<Harness />);
      await user.type(await screen.findByLabelText('Name'), 'Ada{Enter}');
      expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    });

    it('refuses a blank name without saving', async () => {
      const fake = signedIn({ ...member, name: null });
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(await screen.findByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Enter your name');
      expect(fake.update).not.toHaveBeenCalled();
    });

    it('closes with Later, and with Escape', async () => {
      signedIn({ ...member, name: null });
      const user = userEvent.setup();
      const { unmount } = render(<Harness />);
      await user.click(await screen.findByRole('button', { name: 'Later' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('ada@example.com · Member');
      unmount();

      render(<Harness />);
      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('does not ask an account that already has a name, or a deactivated one', async () => {
      signedIn(member);
      const { unmount } = render(<Harness />);
      await screen.findByRole('status');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      unmount();

      signedIn({ ...member, name: null, active: false });
      render(<Harness />);
      await screen.findByRole('status');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
