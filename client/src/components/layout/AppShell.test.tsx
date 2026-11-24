import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountState, Profile } from '../../hooks/useAccount';
import { HELP_URL } from '../../lib/navigation';
import { AppShell } from './AppShell';
import type { AccountApi } from './AccountMenu';

const profile: Profile = { name: 'Ada', role: 'Member', active: true };
const accountWith = (account: AccountState): AccountApi => ({ account, actionError: null, signOut: vi.fn(), saveName: vi.fn() });
const signedIn = (overrides: Partial<Profile> | null = {}): AccountApi =>
  accountWith({ status: 'signed-in', userId: 'u1', email: 'ada@example.com', profile: overrides ? { ...profile, ...overrides } : null });

/** The navigation column shows from 80rem wide; below that (and in jsdom) the same navigation opens from the Menu button. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open navigation' }));
  return screen.getByRole('navigation', { name: 'App' });
}

afterEach(() => window.history.pushState({}, '', '/'));

describe('AppShell header', () => {
  it('shows an Admin the brand, the page links, a help link and the title, and no notification bell', () => {
    render(<AppShell account={signedIn({ role: 'Admin' })} title="Dashboard" intro="Your file workspace."><p>content</p></AppShell>);
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'CSV Files' })).toHaveAttribute('href', '/');
    expect(within(header).getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(within(header).getByText('Your file workspace.')).toBeInTheDocument();
    const pages = within(header).getByRole('navigation', { name: 'Pages' });
    expect(within(pages).getByRole('link', { name: /CSV Generator/ })).toHaveAttribute('href', '/generator');
    expect(within(pages).getByRole('link', { name: /Architecture/ })).toHaveAttribute('href', '/architecture');
    const help = within(header).getByRole('link', { name: 'Help (opens in a new tab)' });
    expect(help).toHaveAttribute('href', HELP_URL);
    expect(help).toHaveAttribute('target', '_blank');
    expect(help).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(header).queryByRole('button', { name: /notification/i })).not.toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('shows no title for a page that keeps its own heading', () => {
    render(<AppShell account={signedIn()}><h1>Elsewhere</h1></AppShell>);
    expect(within(screen.getByRole('banner')).queryByRole('heading')).not.toBeInTheDocument();
  });

  it('marks the current page link', () => {
    window.history.pushState({}, '', '/generator');
    render(<AppShell account={signedIn({ role: 'Admin' })}><p /></AppShell>);
    const pages = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(pages).getByRole('link', { name: /CSV Generator/ })).toHaveAttribute('aria-current', 'page');
    expect(within(pages).getByRole('link', { name: /Architecture/ })).not.toHaveAttribute('aria-current');
  });

  it('shows Sign in when signed out, and the account menu when signed in', () => {
    const { unmount } = render(<AppShell account={accountWith({ status: 'signed-out' })}><p /></AppShell>);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    unmount();
    render(<AppShell account={signedIn()}><p /></AppShell>);
    expect(screen.getByRole('button', { name: /^Account menu/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});

describe('AppShell navigation', () => {
  it('lists the workspace entries and no Admin group or help card for a Member', async () => {
    const user = userEvent.setup();
    render(<AppShell account={signedIn()}><p /></AppShell>);
    const nav = await openMenu(user);
    for (const [name, href] of [['Dashboard', '/'], ['My Files', '/#files'], ['Processing', '/#processing'], ['Results', '/#results']])
      expect(within(nav).getByRole('link', { name })).toHaveAttribute('href', href);
    expect(within(nav).queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
    // Help is only the header's ? link; the navigation has no help card.
    expect(within(nav).queryByRole('link', { name: /View Documentation/ })).not.toBeInTheDocument();
  });

  it('shows the Admin group and the Generator and Architecture links to an active Admin only', async () => {
    const admin = signedIn({ role: 'Admin' });
    const cases: [string, AccountApi, boolean][] = [
      ['an active Admin', admin, true],
      ['a Member', signedIn({ role: 'Member' }), false],
      ['a deactivated Admin', signedIn({ role: 'Admin', active: false }), false],
      ['an account with no profile', signedIn(null), false],
      ['a demo guest', accountWith({ status: 'demo', sessionId: 's1' }), false],
      ['a signed-out visitor', accountWith({ status: 'signed-out' }), false],
      ['a loading session', accountWith({ status: 'loading' }), false],
      ['a failed account read', accountWith({ status: 'error', message: 'boom' }), false],
      ['a site without sign-in', accountWith({ status: 'unconfigured' }), false],
    ];
    for (const [who, account, visible] of cases) {
      const user = userEvent.setup();
      const { unmount } = render(<AppShell account={account}><p /></AppShell>);
      // The header's page links, then the drawer's, which the header hides on phones.
      expect(!!screen.queryByRole('navigation', { name: 'Pages' }), who).toBe(visible);
      const nav = await openMenu(user);
      const group = within(nav).queryByRole('heading', { name: 'Admin' });
      expect(!!group, who).toBe(visible);
      for (const [name, href] of [['Invitations', '/admin#invitations'], ['Users', '/admin#users'], ['Access & Roles', '/admin#access'], ['CSV Generator', '/generator'], ['Architecture', '/architecture']]) {
        const link = within(nav).queryByRole('link', { name });
        expect(!!link, `${who}: ${name}`).toBe(visible);
        if (link) expect(link).toHaveAttribute('href', href);
      }
      unmount();
    }
  });

  it('marks the entry for the current page and hash', async () => {
    window.history.pushState({}, '', '/#results');
    const user = userEvent.setup();
    const first = render(<AppShell account={signedIn({ role: 'Admin' })}><p /></AppShell>);
    let nav = await openMenu(user);
    expect(within(nav).getByRole('link', { name: 'Results' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    first.unmount();

    window.history.pushState({}, '', '/admin#users');
    render(<AppShell account={signedIn({ role: 'Admin' })}><p /></AppShell>);
    nav = await openMenu(user);
    expect(within(nav).getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Results' })).not.toHaveAttribute('aria-current');
  });

  it('opens as a drawer, closes with Escape and returns focus to the Menu button', async () => {
    const user = userEvent.setup();
    render(<AppShell account={signedIn()}><p /></AppShell>);
    const button = screen.getByRole('button', { name: 'Open navigation' });
    await openMenu(user);
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('hands a workspace entry to the page, updates the address and closes the drawer', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<AppShell account={signedIn()} onNavigate={onNavigate}><p /></AppShell>);

    await user.click(within(await openMenu(user)).getByRole('link', { name: 'Results' }));
    expect(onNavigate).toHaveBeenLastCalledWith('results');
    expect(window.location.hash).toBe('#results');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // The same entry again is applied again, even though the address does not change.
    await user.click(within(await openMenu(user)).getByRole('link', { name: 'Results' }));
    expect(onNavigate).toHaveBeenCalledTimes(2);

    await user.click(within(await openMenu(user)).getByRole('link', { name: 'Dashboard' }));
    expect(onNavigate).toHaveBeenLastCalledWith('dashboard');
    expect(window.location.pathname + window.location.hash).toBe('/');
  });

  it('applies an Admin entry on the Admin page without loading it again', async () => {
    window.history.pushState({}, '', '/admin');
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<AppShell account={signedIn({ role: 'Admin' })} onNavigate={onNavigate}><p /></AppShell>);
    await user.click(within(await openMenu(user)).getByRole('link', { name: 'Access & Roles' }));
    expect(onNavigate).toHaveBeenCalledWith('access');
    expect(window.location.hash).toBe('#access');
  });
});
