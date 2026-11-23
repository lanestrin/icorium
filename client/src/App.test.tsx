import { render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from './App';

// The CSV Generator page fails to render, standing in for any page with a rendering bug.
vi.mock('./pages/GeneratorPage', () => ({
  GeneratorPage: () => {
    throw new Error('render failed');
  },
}));


describe('App', () => {
  // Transforming the Architecture page takes over a second in jsdom the first time; do it once here so
  // the loading test measures the app, not the test runner. The page still loads lazily in each test.
  beforeAll(() => import('./pages/ArchitecturePage'));

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.doUnmock('./pages/ArchitecturePage');
    vi.restoreAllMocks();
  });

  it('shows a loading message while a page downloads, then the page', async () => {
    window.history.replaceState(null, '', '/architecture');

    render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading page…');
    expect(await screen.findByRole('heading', { level: 1, name: /Architecture/ })).toBeInTheDocument();
    expect(screen.queryByText('Loading page…')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });

  it.each([
    ['/sign-in', 'Sign in'],
    ['/activate', 'Activate your account'],
    ['/reset-password', 'Reset your password'],
    ['/sign-in/', 'Sign in'],
    ['/admin', 'Admin'],
  ])('opens the page at %s', async (path, heading) => {
    window.history.replaceState(null, '', path);

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    // The test build has no Supabase settings, so each page explains that instead of showing a form.
    expect(screen.getByText("Sign-in isn't set up on this site yet.")).toBeInTheDocument();
  });

  it('shows the error message instead of a blank screen when a page fails to render', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState(null, '', '/generator');

    render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading page…');
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
    const { default: FreshApp } = await import('./App');
    window.history.replaceState(null, '', '/architecture');

    render(<FreshApp />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Something went wrong' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  });
});
