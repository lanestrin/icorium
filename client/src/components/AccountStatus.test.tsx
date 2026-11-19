import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../hooks/useAccount';
import { getSupabase, isAuthConfigured } from '../lib/supabase';
import { fakeSession, fakeSupabase } from '../test-fixtures/fake-supabase';
import { AccountStatus } from './AccountStatus';

vi.mock('../lib/supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn(() => true) }));

function setUp(options: Parameters<typeof fakeSupabase>[0] = {}) {
  const fake = fakeSupabase(options);
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  return fake;
}
const signedIn = (profile: Profile | null) => setUp({ session: fakeSession(), profile });
const member: Profile = { name: 'Ada', role: 'Member', active: true };

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthConfigured).mockReturnValue(true);
});

describe('AccountStatus', () => {
  it('shows nothing on a site without sign-in', () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    const { container } = render(<AccountStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing while loading or when signed out, and never a sign-in link', async () => {
    setUp();
    const { container } = render(<AccountStatus />);
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(getSupabase).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('shows the name and role of an active account, with Sign out', async () => {
    signedIn({ ...member, role: 'Admin' });
    render(<AccountStatus />);
    expect(await screen.findByLabelText('Account')).toHaveTextContent('Ada · Admin');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('explains an account that is not activated yet', async () => {
    signedIn(null);
    render(<AccountStatus />);
    expect(await screen.findByLabelText('Account')).toHaveTextContent('Account not active yet');
  });

  it('explains a deactivated account', async () => {
    signedIn({ ...member, active: false });
    render(<AccountStatus />);
    expect(await screen.findByLabelText('Account')).toHaveTextContent('Account deactivated');
  });

  it('shows a failed account read, with Sign out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setUp({ session: fakeSession(), profileError: { message: 'boom' } });
    render(<AccountStatus />);
    expect(await screen.findByLabelText('Account')).toHaveTextContent('Something went wrong. Try again.');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('renders the name as text, not markup', async () => {
    signedIn({ ...member, name: '<b>Ada</b>' });
    render(<AccountStatus />);
    expect(await screen.findByLabelText('Account')).toHaveTextContent('<b>Ada</b> · Member');
  });

  it('signs out on this device', async () => {
    const fake = signedIn(member);
    const user = userEvent.setup();
    const { container } = render(<AccountStatus />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows why sign-out failed', async () => {
    const fake = signedIn(member);
    fake.auth.signOut.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0 } });
    const user = userEvent.setup();
    render(<AccountStatus />);
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
  });

  describe('name prompt', () => {
    it('asks a nameless active account for a name and saves it', async () => {
      const fake = signedIn({ ...member, name: null });
      const user = userEvent.setup();
      render(<AccountStatus />);
      const dialog = await screen.findByRole('dialog', { name: 'What should we call you?' });
      await user.type(screen.getByLabelText('Name'), ' Ada Lovelace ');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(fake.update).toHaveBeenCalledWith({ name: 'Ada Lovelace' });
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      expect(screen.getByLabelText('Account')).toHaveTextContent('Ada Lovelace · Member');
    });

    it('keeps the dialog open with the message when saving fails', async () => {
      const fake = signedIn({ ...member, name: null });
      fake.updateEq.mockResolvedValueOnce({ error: { name: 'AuthRetryableFetchError', status: 0 } });
      const user = userEvent.setup();
      render(<AccountStatus />);
      await user.type(await screen.findByLabelText('Name'), 'Ada{Enter}');
      expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    });

    it('refuses a blank name without saving', async () => {
      const fake = signedIn({ ...member, name: null });
      const user = userEvent.setup();
      render(<AccountStatus />);
      await user.click(await screen.findByRole('button', { name: 'Save' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Enter your name');
      expect(fake.update).not.toHaveBeenCalled();
    });

    it('closes with Later, and with Escape', async () => {
      signedIn({ ...member, name: null });
      const user = userEvent.setup();
      const { unmount } = render(<AccountStatus />);
      await user.click(await screen.findByRole('button', { name: 'Later' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Account')).toHaveTextContent('ada@example.com · Member');
      unmount();

      render(<AccountStatus />);
      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('does not ask an account that already has a name', async () => {
      signedIn(member);
      render(<AccountStatus />);
      await screen.findByLabelText('Account');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not ask a deactivated account', async () => {
      signedIn({ ...member, name: null, active: false });
      render(<AccountStatus />);
      await screen.findByLabelText('Account');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
