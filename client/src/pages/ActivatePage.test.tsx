import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVITE_ONLY_MESSAGE } from '../lib/auth';
import { getSupabase, isAuthConfigured } from '../lib/supabase';
import { fakeSupabase } from '../test-fixtures/fake-supabase';
import { ActivatePage } from './ActivatePage';

vi.mock('../lib/supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn(() => true) }));

function setUp() {
  const fake = fakeSupabase();
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  return fake;
}

async function fill(user: ReturnType<typeof userEvent.setup>, name = '  Ada Lovelace ') {
  if (name) await user.type(screen.getByLabelText('Name'), name);
  await user.type(screen.getByLabelText('Email'), 'ada@example.com');
  await user.type(screen.getByLabelText('Password'), 'correct horse');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthConfigured).mockReturnValue(true);
});

describe('ActivatePage', () => {
  it('creates the account with the trimmed name and asks the person to confirm their email', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<ActivatePage />);
    await fill(user);
    expect(fake.auth.signUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'correct horse',
      options: { data: { name: 'Ada Lovelace' }, emailRedirectTo: `${window.location.origin}/sign-in` },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email to confirm your address, then sign in.');
  });

  it('shows the invite-only rejection', async () => {
    const fake = setUp();
    fake.auth.signUp.mockResolvedValueOnce({ error: { name: 'AuthApiError', status: 403, message: INVITE_ONLY_MESSAGE } });
    const user = userEvent.setup();
    render(<ActivatePage />);
    await fill(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(INVITE_ONLY_MESSAGE);
    expect(screen.queryByText(/Check your email/)).not.toBeInTheDocument();
  });

  it('asks for a name before sending anything, then clears the error as the person types', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<ActivatePage />);
    await fill(user, '');
    const name = screen.getByLabelText('Name');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name (up to 100 characters).');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(name.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    expect(fake.auth.signUp).not.toHaveBeenCalled();
    await user.type(name, 'A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses a name longer than 100 characters', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<ActivatePage />);
    await user.click(screen.getByLabelText('Name'));
    await user.paste('a'.repeat(101));
    await fill(user, '');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your name');
    expect(fake.auth.signUp).not.toHaveBeenCalled();
  });

  it('asks for a stronger password', async () => {
    const fake = setUp();
    fake.auth.signUp.mockResolvedValueOnce({ error: { name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, reasons: ['length'] } });
    const user = userEvent.setup();
    render(<ActivatePage />);
    await fill(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a stronger password: make it longer.');
  });

  it('reports a network failure and lets the person try again', async () => {
    const fake = setUp();
    fake.auth.signUp.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<ActivatePage />);
    await fill(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });

  it('disables the button while creating the account', async () => {
    const fake = setUp();
    fake.auth.signUp.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ActivatePage />);
    await fill(user);
    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled();
  });

  it('offers Google sign-up back to this site', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<ActivatePage />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } }));
  });

  it('says sign-in is not set up on a site without Supabase settings', () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    render(<ActivatePage />);
    expect(screen.getByRole('status')).toHaveTextContent("Sign-in isn't set up on this site yet.");
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
});
