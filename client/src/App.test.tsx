import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Profile } from './hooks/useAccount';
import { api } from './lib/api';
import { callAdmin } from './lib/admin';
import { DEMO_SESSION_KEY } from './lib/demo';
import { browserLocation } from './lib/navigation';
import { getSupabase, isAuthConfigured } from './lib/supabase';
import { DEMO_SESSION } from './test-fixtures/accounts';
import { fakeSession, fakeSupabase } from './test-fixtures/fake-supabase';

vi.mock('./lib/supabase', () => ({ getSupabase: vi.fn(), isAuthConfigured: vi.fn() }));
vi.mock('./lib/admin', async (original) => ({ ...(await original<typeof import('./lib/admin')>()), callAdmin: vi.fn(async () => ({ ok: true, data: { accounts: [], invitations: [] } })) }));

// Which pages were rendered. The real pages are used, except the Generator, which can be made to fail.
const rendered = vi.hoisted(() => ({ pages: [] as string[], generatorFails: false }));
/** The real page, recording that it was rendered. */
async function tracked(name: string, load: () => Promise<unknown>, key: string) {
  const real = ((await load()) as Record<string, (props: unknown) => ReactNode>)[key];
  return {
    [key]: (props: unknown) => {
      rendered.pages.push(name);
      if (name === 'generator' && rendered.generatorFails) throw new Error('render failed');
      return real(props);
    },
  };
}
vi.mock('./pages/GeneratorPage', async (original) => tracked('generator', () => original(), 'GeneratorPage'));
vi.mock('./pages/FilesPage', async (original) => tracked('files', () => original(), 'FilesPage'));
vi.mock('./pages/AdminPage', async (original) => tracked('admin', () => original(), 'AdminPage'));
vi.mock('./pages/ArchitecturePage', async (original) => tracked('architecture', () => original(), 'ArchitecturePage'));

const member: Profile = { name: 'Ada', role: 'Member', active: true };
const admin: Profile = { ...member, role: 'Admin' };

/** A site with sign-in; session and profile are what the person has. */
function site(options: Parameters<typeof fakeSupabase>[0] = {}) {
  const fake = fakeSupabase(options);
  vi.mocked(isAuthConfigured).mockReturnValue(true);
  vi.mocked(getSupabase).mockResolvedValue(fake.client);
  return fake;
}
const signedInAs = (profile: Profile | null) => site({ session: fakeSession(), profile });
const startDemoTab = () => sessionStorage.setItem(DEMO_SESSION_KEY, DEMO_SESSION);
const open = (path: string) => {
  window.history.replaceState(null, '', path);
  return render(<App />);
};

const PROTECTED = ['/', '/unknown', '/admin', '/architecture', '/generator', '/generator/'];
const ADMIN_PAGES = ['/admin', '/admin/', '/architecture', '/generator'];

// Transforming the pages takes over a second in jsdom the first time; do it once here so the loading
// tests measure the app, not the test runner. The pages still load lazily in each test.
beforeAll(async () => {
  await Promise.all([import('./pages/ArchitecturePage'), import('./pages/FilesPage'), import('./pages/GeneratorPage'), import('./pages/AdminPage')]);
}, 30_000);

beforeEach(() => {
  rendered.pages = [];
  vi.mocked(callAdmin).mockClear();
  rendered.generatorFails = false;
  vi.mocked(isAuthConfigured).mockReturnValue(false);
  vi.mocked(getSupabase).mockResolvedValue(null);
  vi.spyOn(browserLocation, 'replace').mockImplementation(() => {});
  vi.spyOn(browserLocation, 'reload').mockImplementation(() => {});
  vi.spyOn(api, 'list').mockResolvedValue([]);
  vi.spyOn(api, 'storageMode').mockResolvedValue('cloud');
  vi.spyOn(api, 'setWorkspace');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
  vi.doUnmock('./pages/ArchitecturePage');
  vi.restoreAllMocks();
});

describe('App pages', () => {
  it('shows a loading message while a page downloads, then the page', async () => {
    signedInAs(admin);
    open('/architecture');
    expect(screen.getByRole('status')).toHaveTextContent('Loading page…');
    expect(await screen.findByRole('heading', { level: 1, name: /Architecture/ })).toBeInTheDocument();
    expect(screen.queryByText('Loading page…')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });

  it.each([
    ['/sign-in', 'Sign in to your workspace'],
    ['/activate', 'Activate your account'],
    ['/reset-password', 'Reset your password'],
    ['/sign-in/', 'Sign in to your workspace'],
  ])('keeps %s public', async (path, heading) => {
    open(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    // This site has no Supabase settings, so each page explains that instead of showing a form.
    expect(screen.getByText("Sign-in isn't set up on this site yet.")).toBeInTheDocument();
    expect(browserLocation.replace).not.toHaveBeenCalled();
  });

  it('shows the error message instead of a blank screen when a page fails to render', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rendered.generatorFails = true;
    signedInAs(admin);
    open('/generator');
    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });

  it('offers Reload page when a page’s code fails to download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A fresh App whose Architecture page import rejects, as when the browser can't fetch its chunk.
    vi.resetModules();
    vi.doMock('./pages/ArchitecturePage', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const supabase = await import('./lib/supabase');
    vi.mocked(supabase.isAuthConfigured).mockReturnValue(true);
    vi.mocked(supabase.getSupabase).mockResolvedValue(fakeSupabase({ session: fakeSession(), profile: admin }).client);
    const { default: FreshApp } = await import('./App');
    window.history.replaceState(null, '', '/architecture');

    render(<FreshApp />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });
});

describe('App access', () => {
  it.each(PROTECTED)('sends a signed-out visitor at %s to sign-in and opens nothing', async (path) => {
    site({ session: null });
    open(path);
    await waitFor(() => expect(browserLocation.replace).toHaveBeenCalledWith('/sign-in'));
    expect(screen.getByRole('status')).toHaveTextContent('Opening sign-in…');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(rendered.pages).toEqual([]);
    expect(callAdmin).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
  });

  it.each(PROTECTED)('fails closed at %s on a site without Supabase settings', async (path) => {
    open(path);
    await waitFor(() => expect(browserLocation.replace).toHaveBeenCalledWith('/sign-in'));
    expect(rendered.pages).toEqual([]);
    expect(callAdmin).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.setWorkspace).toHaveBeenLastCalledWith({ kind: 'closed' });
  });

  it('opens nothing while the account loads', async () => {
    const fake = signedInAs(admin);
    fake.maybeSingle.mockReturnValue(new Promise(() => {}));
    open('/generator');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(screen.getByRole('status')).toHaveTextContent('Loading page…');
    expect(rendered.pages).toEqual([]);
    expect(callAdmin).not.toHaveBeenCalled();
    expect(browserLocation.replace).not.toHaveBeenCalled();
  });

  it.each(['/', '/unknown'])('opens the workspace at %s for a Member, and for a demo guest without settings', async (path) => {
    signedInAs(member);
    const first = open(path);
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(api.setWorkspace).toHaveBeenLastCalledWith({ kind: 'cloud', userId: 'user-1' });
    first.unmount();

    vi.mocked(isAuthConfigured).mockReturnValue(false);
    startDemoTab();
    open(path);
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(api.setWorkspace).toHaveBeenLastCalledWith({ kind: 'demo', sessionId: DEMO_SESSION });
  });

  it.each(ADMIN_PAGES)('opens %s for an active Admin', async (path) => {
    signedInAs(admin);
    open(path);
    expect(await screen.findByRole('heading', { level: 1, name: /^(Admin|CSV Generator|Architecture & Tech Stack)$/ })).toBeInTheDocument();
  });

  it.each(ADMIN_PAGES)('tells a Member at %s it is for Admins only, with a way back', async (path) => {
    signedInAs(member);
    open(path);
    expect(await screen.findByRole('heading', { level: 1, name: 'Admins only' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This page is for administrators.');
    expect(screen.getByRole('link', { name: 'Go to CSV Files' })).toHaveAttribute('href', '/');
    expect(rendered.pages).toEqual([]);
    expect(callAdmin).not.toHaveBeenCalled();
  });

  it.each(ADMIN_PAGES)('tells a demo guest at %s it is for Admins only, even over an Admin session', async (path) => {
    signedInAs(admin);
    startDemoTab();
    open(path);
    expect(await screen.findByRole('heading', { level: 1, name: 'Admins only' })).toBeInTheDocument();
    expect(rendered.pages).toEqual([]);
    expect(callAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ['no profile', null, 'Account not active yet'],
    ['an inactive Admin profile', { ...admin, active: false }, 'Account deactivated'],
  ])('explains %s on every protected page and keeps Sign out and the export reachable', async (_name, profile, title) => {
    for (const path of ['/', '/generator']) {
      signedInAs(profile);
      const page = open(path);
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      if (profile) expect(screen.getByRole('alert')).toHaveTextContent('Account deactivated. Ask an administrator.');
      await userEvent.setup().click(screen.getByRole('button', { name: /^Account menu/ }));
      const menu = within(screen.getByRole('menu'));
      expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
      expect(menu.getByRole('menuitem', { name: "Export this browser's files" })).toBeInTheDocument();
      page.unmount();
    }
    expect(api.list).not.toHaveBeenCalled();
    expect(api.setWorkspace).toHaveBeenLastCalledWith({ kind: 'closed' });
    expect(rendered.pages).toEqual([]);
    expect(callAdmin).not.toHaveBeenCalled();
  });

  it('says an unreadable account is temporarily unavailable and reloads on Try again', async () => {
    site({ session: fakeSession(), profileError: { message: 'secret provider detail', status: 500 } });
    open('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Temporarily unavailable' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('secret provider detail');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(browserLocation.reload).toHaveBeenCalledTimes(1);
    expect(api.list).not.toHaveBeenCalled();
  });
});

describe('App access changes while a page is open', () => {
  const rows = () => screen.findByRole('spinbutton', { name: 'Rows' });
  const nextProfile = (fake: ReturnType<typeof fakeSupabase>, profile: Profile | null) => fake.maybeSingle.mockResolvedValue({ data: profile, error: null });

  it('removes the page when the person signs out in another tab', async () => {
    const fake = signedInAs(member);
    open('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    act(() => fake.emit('SIGNED_OUT', null));
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(browserLocation.replace).toHaveBeenCalledWith('/sign-in');
    expect(api.setWorkspace).toHaveBeenLastCalledWith({ kind: 'closed' });
  });

  it.each([
    ['demoted', member, 'Admins only'],
    ['deactivated', { ...admin, active: false }, 'Account deactivated'],
  ])('removes an Admin page when the next profile read says %s', async (_name, profile, title) => {
    const fake = signedInAs(admin);
    open('/generator');
    await rows();
    nextProfile(fake, profile);
    act(() => fake.emit('TOKEN_REFRESHED', fakeSession()));
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Rows' })).not.toBeInTheDocument();
  });

  it("keeps the page's state through a token refresh of the same account", async () => {
    const fake = signedInAs(admin);
    open('/generator');
    const input = await rows();
    fireEvent.change(input, { target: { value: '77' } });
    act(() => fake.emit('TOKEN_REFRESHED', fakeSession()));
    await waitFor(() => expect(fake.maybeSingle).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(await rows()).toBe(input);
    expect(input).toHaveValue(77);
  });

  it("removes the page as soon as another account's session arrives, and starts it fresh for that account", async () => {
    const fake = signedInAs(admin);
    open('/generator');
    fireEvent.change(await rows(), { target: { value: '77' } });
    act(() => fake.emit('SIGNED_IN', fakeSession('bo@example.com', 'user-2')));
    expect(screen.queryByRole('spinbutton', { name: 'Rows' })).not.toBeInTheDocument();
    expect(await rows()).toHaveValue(25);
    expect(api.setWorkspace).toHaveBeenLastCalledWith({ kind: 'cloud', userId: 'user-2' });
  });

  it('reloads a page restored from the back/forward cache, and only then', async () => {
    signedInAs(member);
    open('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const show = (persisted: boolean) => act(() => { window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted })); });
    show(false);
    expect(browserLocation.reload).not.toHaveBeenCalled();
    show(true);
    expect(browserLocation.reload).toHaveBeenCalledTimes(1);
  });
});
