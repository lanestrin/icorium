import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminMessage, callAdmin, type AdminAction, type AdminList, type AdminResult } from '../lib/admin';
import { getSupabase, isAuthConfigured } from '../lib/supabase';
import { fakeSession, fakeSupabase } from '../test-fixtures/fake-supabase';
import { AdminPage } from './AdminPage';

vi.mock('../lib/supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn(() => true) }));
vi.mock('../lib/admin', async (original) => ({ ...(await original<typeof import('../lib/admin')>()), callAdmin: vi.fn() }));

const ME = 'user-1';
const OTHER = 'user-2';

const baseData = (): AdminList => ({
  accounts: [
    { user_id: ME, email: 'ada@example.com', name: 'Ada', role: 'Admin', active: true, created_at: '2026-11-01T00:00:00Z' },
    { user_id: OTHER, email: 'bo@example.com', name: null, role: 'Member', active: true, created_at: '2026-11-02T00:00:00Z' },
    { user_id: 'user-3', email: 'cy@example.com', name: 'Cy', role: 'Member', active: false, created_at: '2026-11-03T00:00:00Z' },
  ],
  invitations: [
    { id: 'i-pending', email: 'new@example.com', role: 'Member', state: 'pending', created_at: '2026-11-20T00:00:00Z', expires_at: '2026-12-20T00:00:00Z' },
    { id: 'i-expired', email: 'late@example.com', role: 'Admin', state: 'expired', created_at: '2026-09-01T00:00:00Z', expires_at: '2026-10-01T00:00:00Z' },
    { id: 'i-accepted', email: 'bo@example.com', role: 'Member', state: 'accepted', created_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z' },
    { id: 'i-revoked', email: 'gone@example.com', role: 'Member', state: 'revoked', created_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-01T00:00:00Z' },
  ],
});

type Handler = (request: AdminAction) => AdminResult<unknown> | Promise<AdminResult<unknown>>;
const ok = <T,>(data: T): AdminResult<T> => ({ ok: true, data });
const fail = (code: string, action?: AdminAction['action']): AdminResult<never> => ({ ok: false, code, message: adminMessage(code, action) });

/** Sets up the signed-in account and the Admin function's answers; list answers with `data` unless handled. */
function setUp({ role = 'Admin' as 'Admin' | 'Member', data = baseData(), handler = (() => undefined) as (request: AdminAction) => ReturnType<Handler> | undefined } = {}) {
  const fake = fakeSupabase({ session: fakeSession('ada@example.com', ME), profile: { name: 'Ada', role, active: true } });
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  const requests: AdminAction[] = [];
  vi.mocked(callAdmin).mockImplementation((async (request: AdminAction) => {
    requests.push(request);
    return (await handler(request)) ?? (request.action === 'list' ? ok(data) : ok({ id: 'x', expires_at: '2027-01-05T00:00:00Z' }));
  }) as typeof callAdmin);
  return { requests, actions: () => requests.filter((request) => request.action !== 'list') };
}

const row = (list: string, text: string) => within(screen.getByRole('list', { name: list })).getByText(text).closest('li') as HTMLElement;

beforeEach(() => vi.mocked(isAuthConfigured).mockReturnValue(true));
afterEach(() => vi.clearAllMocks());

describe('AdminPage: who sees it', () => {
  it('explains a site without sign-in', async () => {
    vi.mocked(isAuthConfigured).mockReturnValue(false);
    render(<AdminPage />);
    expect(await screen.findByText("Sign-in isn't set up on this site yet.")).toBeInTheDocument();
    expect(callAdmin).not.toHaveBeenCalled();
  });

  it('asks a signed-out visitor to sign in', async () => {
    vi.mocked(getSupabase).mockResolvedValue(fakeSupabase({ session: null }).client);
    render(<AdminPage />);
    expect(await screen.findByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/sign-in');
    expect(callAdmin).not.toHaveBeenCalled();
  });

  it('shows a Member "Admins only" and sends no request', async () => {
    setUp({ role: 'Member' });
    render(<AdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Admins only');
    expect(callAdmin).not.toHaveBeenCalled();
  });
});

describe('AdminPage: lists', () => {
  it('shows invitations and accounts with their states and the right actions', async () => {
    setUp();
    render(<AdminPage />);

    const pending = await waitFor(() => row('Invitations', 'new@example.com'));
    expect(within(pending).getByText('Pending')).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: /Resend/ })).toBeEnabled();
    expect(within(pending).getByRole('button', { name: /Extend/ })).toBeEnabled();
    expect(within(pending).getByRole('button', { name: /Revoke/ })).toBeEnabled();

    const expired = row('Invitations', 'late@example.com');
    expect(within(expired).getByText('Expired')).toBeInTheDocument();
    expect(within(expired).queryByRole('button', { name: /Resend/ })).not.toBeInTheDocument();
    expect(within(expired).getByRole('button', { name: /Extend/ })).toBeInTheDocument();
    expect(within(expired).getByRole('button', { name: /Revoke/ })).toBeInTheDocument();

    for (const [email, label] of [['gone@example.com', 'Revoked']] as const) {
      const closed = row('Invitations', email);
      expect(within(closed).getByText(label)).toBeInTheDocument();
      expect(within(closed).queryByRole('button')).not.toBeInTheDocument();
    }
    const accepted = within(screen.getByRole('list', { name: 'Invitations' })).getAllByText('bo@example.com')[0].closest('li') as HTMLElement;
    expect(within(accepted).getByText('Accepted')).toBeInTheDocument();
    expect(within(accepted).queryByRole('button')).not.toBeInTheDocument();

    expect(within(row('Accounts', 'Ada (you)')).getByText('Active')).toBeInTheDocument();
    expect(within(row('Accounts', 'Cy')).getByText('Deactivated')).toBeInTheDocument();
    expect(within(row('Accounts', 'Cy')).getByRole('button', { name: 'Reactivate cy@example.com' })).toBeInTheDocument();
  });

  it('shows empty lists', async () => {
    setUp({ data: { accounts: [], invitations: [] } });
    render(<AdminPage />);
    expect(await screen.findByText('No invitations yet.')).toBeInTheDocument();
    expect(screen.getByText('No accounts yet.')).toBeInTheDocument();
  });

  it('shows a list error and loads again on Try again', async () => {
    setUp();
    vi.mocked(callAdmin).mockImplementationOnce(async () => ({ ok: false, code: 'unavailable', message: 'Sign-in is temporarily unavailable. Try again later.' }));
    render(<AdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Accounts' })).toBeInTheDocument();
  });
});

describe('AdminPage: invitations', () => {
  it('invites a Member by default, clears the form and refreshes the lists', async () => {
    const { actions, requests } = setUp();
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.type(await screen.findByLabelText('Email'), '  Fresh@Example.com ');
    expect(screen.getByLabelText('Role')).toHaveValue('Member');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    expect(await within(screen.getByRole('main')).findByRole('status')).toHaveTextContent('Invitation sent to Fresh@Example.com');
    expect(actions()).toEqual([{ action: 'invite', email: 'Fresh@Example.com', role: 'Member' }]);
    expect(requests.filter((request) => request.action === 'list')).toHaveLength(2);
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('invites an Admin when chosen', async () => {
    const { actions } = setUp();
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.type(await screen.findByLabelText('Email'), 'boss@example.com');
    await user.selectOptions(screen.getByLabelText('Role'), 'Admin');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));
    await screen.findByText('Invitation sent to boss@example.com');
    expect(actions()).toEqual([{ action: 'invite', email: 'boss@example.com', role: 'Admin' }]);
  });

  it('says no invitation was created when the first email fails, and keeps the address', async () => {
    setUp({ handler: (request) => (request.action === 'invite' ? fail('email_failed', 'invite') : undefined) });
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.type(await screen.findByLabelText('Email'), 'fresh@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("The invitation email couldn't be sent, so no invitation was created.");
    expect(alert).not.toHaveTextContent(/delivered|sent to/i);
    expect(screen.getByLabelText('Email')).toHaveValue('fresh@example.com');
  });

  it('resends a pending invitation and extends an expired one without confirmation', async () => {
    const { actions } = setUp();
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.click(await within(await waitFor(() => row('Invitations', 'new@example.com'))).findByRole('button', { name: /Resend/ }));
    expect(await within(screen.getByRole('main')).findByRole('status')).toHaveTextContent('Invitation sent again to new@example.com');

    await user.click(within(row('Invitations', 'late@example.com')).getByRole('button', { name: /Extend/ }));
    await waitFor(() => expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('Invitation to late@example.com now expires on 5 Jan 2027'));
    expect(actions()).toEqual([{ action: 'resend', id: 'i-pending' }, { action: 'extend', id: 'i-expired' }]);
  });

  it('keeps the invitation pending when a resend fails', async () => {
    setUp({ handler: (request) => (request.action === 'resend' ? fail('email_failed', 'resend') : undefined) });
    render(<AdminPage />);
    await userEvent.setup().click(within(await waitFor(() => row('Invitations', 'new@example.com'))).getByRole('button', { name: /Resend/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("The email couldn't be sent. The invitation is still pending.");
  });

  it('revokes only after confirmation, and not when cancelled', async () => {
    const { actions } = setUp();
    const user = userEvent.setup();
    render(<AdminPage />);
    const revoke = within(await waitFor(() => row('Invitations', 'new@example.com'))).getByRole('button', { name: /Revoke/ });

    await user.click(revoke);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(actions()).toEqual([]);

    await user.click(revoke);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    expect(await screen.findByText('Invitation to new@example.com revoked')).toBeInTheDocument();
    expect(actions()).toEqual([{ action: 'revoke', id: 'i-pending' }]);
  });
});

describe('AdminPage: accounts', () => {
  it.each([
    ['a role change', /Make Admin/],
    ['a deactivation', /^Deactivate bo@example.com$/],
  ])('sends nothing when %s is cancelled', async (_label, name) => {
    const { actions } = setUp();
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.click(within(await waitFor(() => row('Accounts', 'bo@example.com'))).getByRole('button', { name }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(actions()).toEqual([]);
  });

  it('changes a role after confirmation', async () => {
    const { actions } = setUp();
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.click(await within(await waitFor(() => row('Accounts', 'bo@example.com'))).findByRole('button', { name: /Make Admin/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('bo@example.com will be able to administer the app');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make Admin' }));
    expect(await screen.findByText('bo@example.com is now Admin')).toBeInTheDocument();
    expect(actions()).toEqual([{ action: 'setRole', userId: OTHER, role: 'Admin' }]);
  });

  it('deactivates after confirmation, and reactivates at once', async () => {
    const { actions } = setUp();
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.click(within(await waitFor(() => row('Accounts', 'bo@example.com'))).getByRole('button', { name: 'Deactivate bo@example.com' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Their files are kept');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('bo@example.com deactivated')).toBeInTheDocument();

    await user.click(within(row('Accounts', 'Cy')).getByRole('button', { name: 'Reactivate cy@example.com' }));
    expect(await screen.findByText('cy@example.com reactivated')).toBeInTheDocument();
    expect(actions()).toEqual([{ action: 'deactivate', userId: OTHER }, { action: 'reactivate', userId: 'user-3' }]);
  });

  it('shows the last-Admin refusal', async () => {
    setUp({ handler: (request) => (request.action === 'deactivate' ? fail('last_admin') : undefined) });
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.click(within(await waitFor(() => row('Accounts', 'Ada (you)'))).getByRole('button', { name: 'Deactivate ada@example.com' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('At least one active Admin must remain.');
  });

  it('shows that sessions were not ended, and still refreshes the lists', async () => {
    const { requests } = setUp({ handler: (request) => (request.action === 'deactivate' ? fail('sessions_not_ended') : undefined) });
    const user = userEvent.setup();
    render(<AdminPage />);
    await user.click(within(await waitFor(() => row('Accounts', 'bo@example.com'))).getByRole('button', { name: 'Deactivate bo@example.com' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Account deactivated, but its open sessions couldn't be ended. Try again.");
    await waitFor(() => expect(requests.filter((request) => request.action === 'list')).toHaveLength(2));
  });
});

describe('AdminPage: access and busy state', () => {
  it('replaces the page when the server says the Admin lost access', async () => {
    setUp({ handler: (request) => (request.action === 'reactivate' ? fail('not_admin') : undefined) });
    render(<AdminPage />);
    await userEvent.setup().click(await within(await waitFor(() => row('Accounts', 'Cy'))).findByRole('button', { name: 'Reactivate cy@example.com' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You no longer have Admin access.');
    expect(screen.queryByRole('list', { name: 'Accounts' })).not.toBeInTheDocument();
  });

  it('shows the same when the first list request is refused', async () => {
    setUp({ handler: () => fail('not_admin') });
    render(<AdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('You no longer have Admin access.');
  });

  it('disables every control while an action runs, so it cannot be sent twice', async () => {
    let finish: (value: AdminResult<unknown>) => void = () => {};
    const { actions } = setUp({ handler: (request) => (request.action === 'reactivate' ? new Promise((resolve) => { finish = resolve; }) : undefined) });
    const user = userEvent.setup();
    render(<AdminPage />);
    const button = await within(await waitFor(() => row('Accounts', 'Cy'))).findByRole('button', { name: 'Reactivate cy@example.com' });
    await user.click(button);

    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Resend invitation/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Sending…|Send invitation/ })).toBeDisabled();
    await user.click(button);
    expect(actions()).toHaveLength(1);

    finish(ok({}));
    await waitFor(() => expect(button).toBeEnabled());
  });
});

describe('AdminPage: navigation (17.9)', () => {
  afterEach(() => window.history.pushState({}, '', '/admin'));

  it('names the account list "Users" and shows the header and navigation', async () => {
    setUp();
    render(<AdminPage />);
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Back to CSV Files/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help (opens in a new tab)' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(within(screen.getByRole('navigation', { name: 'App' })).getByRole('link', { name: 'Access & Roles' })).toHaveAttribute('href', '/admin#access');
  });

  it.each([['#invitations', 'Invite someone'], ['#users', 'Users'], ['#access', 'Users']])('focuses the section for %s once the lists have loaded', async (hash, heading) => {
    window.history.pushState({}, '', `/admin${hash}`);
    setUp();
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: heading })).toHaveFocus());
  });

  it('ignores a section address for a Member and for an unknown name', async () => {
    window.history.pushState({}, '', '/admin#users');
    setUp({ role: 'Member' });
    const member = render(<AdminPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Admins only');
    expect(document.body).toHaveFocus();
    member.unmount();

    window.history.pushState({}, '', '/admin#nonsense');
    setUp();
    render(<AdminPage />);
    await screen.findByRole('heading', { name: 'Users' });
    expect(screen.getByRole('heading', { name: 'Users' })).not.toHaveFocus();
  });
});
