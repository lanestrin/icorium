import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabase, isAuthConfigured } from '../lib/supabase';
import { fakeSession, fakeSupabase } from '../test-fixtures/fake-supabase';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('../lib/supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn(() => true) }));

const SENT = "If an account uses that address, we've sent a link. Open it in this browser to choose a new password.";

function setUp(options: Parameters<typeof fakeSupabase>[0] = {}) {
  const fake = fakeSupabase(options);
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  return fake;
}

async function requestLink(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Email'), ' ada@example.com ');
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
}

/** Opened from the reset link: a session plus the PASSWORD_RECOVERY event. */
const fromLink = () => setUp({ session: fakeSession(), profile: { name: 'Ada', role: 'Member', active: true }, initialEvent: 'PASSWORD_RECOVERY' });

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(isAuthConfigured).mockReturnValue(true);
});

describe('ResetPasswordPage', () => {
  it('emails a reset link that comes back to this page', async () => {
    const fake = setUp();
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await requestLink(user);
    expect(fake.auth.resetPasswordForEmail).toHaveBeenCalledWith('ada@example.com', { redirectTo: `${window.location.origin}/reset-password` });
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
  });

  it('shows the same message whether or not the address has an account', async () => {
    // Supabase returns no error for an unknown address; the page has nothing else to go on.
    const fake = setUp();
    fake.auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await requestLink(user);
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
  });

  it('reports too many requests', async () => {
    const fake = setUp();
    fake.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { name: 'AuthApiError', code: 'over_email_send_rate_limit', status: 429 } });
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await requestLink(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
  });

  it('reports a network failure', async () => {
    const fake = setUp();
    fake.auth.resetPasswordForEmail.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await requestLink(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
  });

  it('disables the button while sending', async () => {
    const fake = setUp();
    fake.auth.resetPasswordForEmail.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await requestLink(user);
    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('asks for the new password when opened from the reset link, and saves it', async () => {
    const fake = fromLink();
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await user.type(await screen.findByLabelText('New password'), 'a much better one');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'a much better one' });
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed.');
    expect(screen.getByRole('link', { name: 'Go to CSV Files' })).toHaveAttribute('href', '/');
  });

  it('asks for a stronger new password', async () => {
    const fake = fromLink();
    fake.auth.updateUser.mockResolvedValueOnce({ error: { name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, reasons: ['characters'] } });
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await user.type(await screen.findByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a stronger password: mix letters, numbers and symbols.');
  });

  it('disables the button while saving the new password', async () => {
    const fake = fromLink();
    fake.auth.updateUser.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ResetPasswordPage />);
    await user.type(await screen.findByLabelText('New password'), 'a much better one');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('says sign-in is not set up on a site without Supabase settings', () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    render(<ResetPasswordPage />);
    expect(screen.getByRole('status')).toHaveTextContent("Sign-in isn't set up on this site yet.");
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});
