import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Root } from './App';
import { ArchitecturePage, TECH } from './components/ArchitecturePage';
import { api } from './api';

vi.mock('./api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  downloadUrl: (id: string) => `/api/files/${id}/download`,
} }));

beforeEach(() => { vi.resetAllMocks(); });

const selected = () => screen.getByRole('region', { name: 'Selected component' });
const node = (name: RegExp) => within(screen.getByRole('group', { name: 'Architecture diagram' })).getByRole('button', { name });

describe('Architecture & Tech Stack page', () => {
  it('introduces the page and links to every section', () => {
    render(<ArchitecturePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Architecture & Tech Stack' })).toBeInTheDocument();
    expect(screen.getByText('Building a maintainable CSV processing application with a focused, type-safe technology stack.')).toBeInTheDocument();
    expect(screen.getByText(/Choose the simplest technology that meets the requirements/)).toBeInTheDocument();
    const links = within(screen.getByRole('navigation', { name: 'On this page' })).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Overview', 'Tech stack', 'Architecture', 'Decisions', 'Storage', 'Trade-offs', 'Evolution']);
    for (const link of links) {
      const id = link.getAttribute('href')!.slice(1);
      expect(document.getElementById(id)?.tagName).toBe('SECTION');
    }
  });

  it('shows a card for each technology with its role, reasons and trade-off', () => {
    render(<ArchitecturePage />);
    const cards = within(screen.getByRole('list', { name: 'Technology stack' })).getAllByRole('listitem').filter((li) => li.querySelector('h3'));
    expect(cards.map((c) => c.querySelector('h3')!.textContent)).toEqual([
      'React 19', 'TypeScript', 'Vite', 'Tailwind CSS 4', 'Fastify 5', 'Zod', 'Papa Parse', 'Recharts', 'Lucide',
      'Vitest + React Testing Library', 'Local filesystem / Vercel Blob',
    ]);
    for (const [i, card] of cards.entries()) {
      expect(card).toHaveTextContent(TECH[i].role);
      expect(card).toHaveTextContent(`Trade-off: ${TECH[i].tradeoff}`);
    }
  });

  it('shows what a selected component does and which files implement it', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    expect(node(/^Fastify REST API/)).toHaveAttribute('aria-pressed', 'true');
    expect(within(selected()).getByRole('list', { name: 'Implemented in' })).toHaveTextContent('server/src/app.tsserver/src/routes/files.ts');

    await user.click(node(/^Partner normalization/));
    expect(node(/^Partner normalization/)).toHaveAttribute('aria-pressed', 'true');
    expect(node(/^Fastify REST API/)).toHaveAttribute('aria-pressed', 'false');
    expect(selected()).toHaveTextContent('Adding a partner means adding one adapter entry.');
    expect(within(selected()).getByRole('list', { name: 'Implemented in' })).toHaveTextContent('server/src/adapters/index.ts');

    // Keyboard: Tab to a component and press Enter.
    node(/^Vercel Blob/).focus();
    await user.keyboard('{Enter}');
    expect(selected()).toHaveTextContent('Used when BLOB_READ_WRITE_TOKEN is set.');
  });

  it('follows a request through the components, in order', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    const flows = screen.getByRole('group', { name: 'Request flow' });
    expect(within(flows).getByRole('button', { name: 'Process' })).toHaveAttribute('aria-pressed', 'true');
    expect(node(/^Processing.*step 8 of the Process flow/)).toBeInTheDocument();

    await user.click(within(flows).getByRole('button', { name: 'Compare' }));
    const steps = within(screen.getByRole('region', { name: 'Compare flow' })).getAllByRole('listitem');
    expect(steps.map((s) => s.querySelector('button')!.textContent)).toEqual([
      'User / Browser', 'React + TypeScript frontend', 'Fastify REST API', 'Storage layer', 'CSV parsing', 'Comparison', 'React + TypeScript frontend',
    ]);
    expect(node(/^Comparison.*step 6 of the Compare flow/)).toBeInTheDocument();
    expect(node(/^Processing/)).not.toHaveAccessibleName(/step/); // not part of a comparison

    await user.click(within(steps[5]).getByRole('button', { name: 'Comparison' }));
    expect(node(/^Comparison/)).toHaveAttribute('aria-pressed', 'true');
    expect(within(selected()).getByRole('list', { name: 'Implemented in' })).toHaveTextContent('server/src/lib/compare.ts');
  });

  it('separates hosting from storage and says what is not built', () => {
    render(<ArchitecturePage />);
    const storage = document.getElementById('storage')!;
    expect(storage).toHaveTextContent('Hosting and storage are separate decisions');
    expect(storage).toHaveTextContent('Configured, not yet deployed');
    expect(within(storage).getByRole('img', { name: /S3 or Cloudflare R2 could be added/ })).toHaveTextContent('S3 / Cloudflare R2Possible future backend · not built');
  });

  it('lists the trade-offs and how the product would evolve', () => {
    render(<ArchitecturePage />);
    const rows = within(screen.getByRole('table', { name: 'Trade-offs' })).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('td')!.textContent)).toEqual([
      'React + Vite', 'Fastify', 'Filesystem / Blob storage', 'Synchronous processing', 'Shared TypeScript types', 'No authentication',
    ]);
    const evolve = document.getElementById('evolve')!;
    expect(within(evolve).getByRole('heading', { level: 2 })).toHaveTextContent('What I would evolve as the product scales');
    expect(evolve).toHaveTextContent('Uploads are already limited to 10 MB');
  });
});

describe('navigation to the Architecture page', () => {
  afterEach(() => { window.history.pushState({}, '', '/'); });

  it('opens at /architecture and is linked from the other pages', async () => {
    vi.mocked(api.list).mockResolvedValue([]);
    window.history.pushState({}, '', '/architecture');
    const page = render(<Root />);
    expect(screen.getByRole('heading', { level: 1, name: 'Architecture & Tech Stack' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to CSV Files/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /CSV Generator/ })).toHaveAttribute('href', '/generator');
    page.unmount();

    window.history.pushState({}, '', '/');
    const files = render(<Root />);
    expect(within(screen.getByRole('navigation', { name: 'Pages' })).getByRole('link', { name: /Architecture/ })).toHaveAttribute('href', '/architecture');
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    files.unmount();

    window.history.pushState({}, '', '/generator');
    render(<Root />);
    expect(screen.getByRole('link', { name: /Architecture/ })).toHaveAttribute('href', '/architecture');
  });
});
