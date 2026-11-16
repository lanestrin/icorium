import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';
import { Banner } from './Banner';

function Broken(): never {
  throw new Error('render failed');
}

/** Loads something that fails and shows the failure in a banner, as the pages do with request errors. */
function FailingRequest() {
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.reject(new Error('Server unavailable')).catch((e: Error) => setError(e.message));
  }, []);
  return error ? <Banner tone="error">{error}</Banner> : <p>Loading…</p>;
}

describe('AppErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders its children when nothing fails', () => {
    render(<AppErrorBoundary><p>CSV Files</p></AppErrorBoundary>);

    expect(screen.getByText('CSV Files')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });

  it('shows the message with focus on its heading when a child fails to render, and still logs the error', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AppErrorBoundary><Broken /></AppErrorBoundary>);

    const heading = screen.getByRole('heading', { level: 1, name: 'Something went wrong' });
    expect(heading).toHaveFocus();
    expect(screen.getByText("This page couldn't be shown. Your files aren't affected. Reload the page to try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeEnabled();
    expect(logged).toHaveBeenCalled();
  });

  it('reloads when Reload page is clicked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReload = vi.fn();
    render(<AppErrorBoundary onReload={onReload}><Broken /></AppErrorBoundary>);

    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }));

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('reloads from the keyboard', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReload = vi.fn();
    render(<AppErrorBoundary onReload={onReload}><Broken /></AppErrorBoundary>);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Reload page' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('leaves request failures to the page banner', async () => {
    render(<AppErrorBoundary><FailingRequest /></AppErrorBoundary>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });
});
