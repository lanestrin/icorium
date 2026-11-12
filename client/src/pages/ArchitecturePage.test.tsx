import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ArchitecturePage } from './ArchitecturePage';
import { HOW_IT_WORKS, TECH } from '../components/architecture/content';
import sectionStyles from '../components/architecture/architecture.module.css';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  downloadUrl: (id: string) => `/api/files/${id}/download`,
} }));

beforeEach(() => { vi.resetAllMocks(); });


describe('Architecture & Tech Stack page', () => {
  it('introduces the page and links to every section', () => {
    render(<ArchitecturePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Architecture & Tech Stack' })).toBeInTheDocument();
    expect(screen.getByText('Building a maintainable CSV processing application with a focused, type-safe technology stack.')).toBeInTheDocument();
    expect(screen.getByText(/Choose the simplest technology that meets the requirements/)).toBeInTheDocument();
    const links = within(screen.getByRole('navigation', { name: 'On this page' })).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Overview', 'Tech stack', 'Architecture', 'Decisions', 'Storage', 'Evolution']);
    for (const link of links) {
      const id = link.getAttribute('href')!.slice(1);
      expect(document.getElementById(id)?.tagName).toBe('SECTION');
    }
    // A line divides each section from the one before it; the first has none.
    const sections = links.map((l) => document.getElementById(l.getAttribute('href')!.slice(1))!);
    for (const section of sections) expect(section).toHaveClass(sectionStyles.section); // divider above, none on the first
    expect(sections[0].matches(':first-of-type')).toBe(true);
    expect(sections.slice(1).some((s) => s.matches(':first-of-type'))).toBe(false);
  });

  it('summarises what the system does in six cards', () => {
    render(<ArchitecturePage />);
    const cards = within(screen.getByRole('list', { name: 'What the system does' })).getAllByRole('listitem');
    expect(cards.map((c) => c.querySelector('.font-semibold')!.textContent)).toEqual(['Import CSVs', 'Normalize', 'Validate', 'Process', 'Compare', 'Run anywhere']);
  });

  it('shows a tile for each technology, and its reasons, trade-off and files when selected', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    const tiles = within(screen.getByRole('group', { name: 'Technology stack' })).getAllByRole('button');
    expect(tiles.map((t) => t.textContent)).toEqual([
      'React 19UI', 'TypeScriptType safety', 'ViteBuild & dev', 'Tailwind CSSStyling', 'Fastify 5API', 'ZodValidation', 'Papa ParseCSV parsing',
      'RechartsCharts', 'LucideIcons', 'VitestTesting', 'Files / BlobFile storage',
    ]);
    const detail = () => screen.getByRole('region', { name: 'Selected technology' });
    expect(tiles[0]).toHaveAttribute('aria-pressed', 'true');
    expect(within(detail()).getByRole('heading', { level: 3 })).toHaveTextContent('React 19');
    for (const [i, tile] of tiles.entries()) {
      await user.click(tile);
      expect(tile).toHaveAttribute('aria-pressed', 'true');
      expect(within(detail()).getByRole('heading', { level: 3 })).toHaveTextContent(TECH[i].name);
      expect(detail()).toHaveTextContent(`Trade-off: ${TECH[i].tradeoff}`);
      for (const w of TECH[i].why) expect(detail()).toHaveTextContent(w);
      for (const f of TECH[i].files) expect(detail()).toHaveTextContent(f);
    }
    expect(tiles.filter((t) => t.getAttribute('aria-pressed') === 'true')).toHaveLength(1);

    // Keyboard: Tab to a tile and press Enter.
    tiles[5].focus();
    await user.keyboard('{Enter}');
    expect(within(detail()).getByRole('heading', { level: 3 })).toHaveTextContent('Zod');
  });

  it('draws how data moves through the app, and explains it in six steps', () => {
    render(<ArchitecturePage />);
    const architecture = document.getElementById('architecture')!;
    expect(within(architecture).getByRole('heading', { level: 2 })).toHaveTextContent('How data moves through the app');
    const diagram = within(architecture).getByRole('list', { name: 'Architecture diagram' });
    expect(within(diagram).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'User / BrowserUpload CSVs and use the app', 'ReactFrontend', 'FastifyAPI', 'Parse', 'Normalize', 'Validate', 'Process', 'Results', 'Storage',
    ]);
    const steps = within(within(architecture).getByRole('region', { name: 'How it works' })).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent)).toEqual(HOW_IT_WORKS.map((text, i) => `${i + 1}${text}`));
    expect(within(architecture).queryByRole('button')).not.toBeInTheDocument(); // a picture, not a control
  });

  it('leads the decisions with where processing runs, and keeps each full reasoning one click away', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    const decisions = document.getElementById('decisions')!;
    const featured = within(decisions).getByRole('article', { name: 'Processing location (server vs. browser)' });
    expect(within(featured).getByRole('list', { name: 'Benefits' }).children).toHaveLength(3);
    expect(featured).toHaveTextContent('Trade-off: server dependency');
    expect(within(decisions).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Processing location (server vs. browser)', 'Why React + Fastify?', 'Why TypeScript throughout?', 'Why files over PostgreSQL?',
      'Why a modular pipeline?', 'Why synchronous processing?',
    ]);
    const reasoning = within(decisions).getAllByText('The full reasoning');
    expect(reasoning).toHaveLength(5);
    const details = reasoning[2].closest('details')!;
    expect(details).not.toHaveAttribute('open');
    await user.click(reasoning[2]);
    expect(details).toHaveAttribute('open');
    expect(details).toHaveTextContent('A database becomes worthwhile with users and permissions');
  });

  it('separates hosting from storage and says what is not built', () => {
    render(<ArchitecturePage />);
    const storage = document.getElementById('storage')!;
    expect(within(storage).getByRole('heading', { level: 2 })).toHaveTextContent('Hosting and storage');
    expect(within(storage).getByRole('list', { name: 'Optional Vercel deployment' })).toHaveTextContent('Configured, not yet deployed');
    expect(within(storage).getByRole('img', { name: /S3 or Cloudflare R2 could be added/ })).toHaveTextContent(
      'Local filesystemDefaultVercel BlobWhen a token is setS3 / Cloudflare R2Not built');
    expect(storage).toHaveTextContent('list · get · read · patch · create · createAt · put');
  });

  it('lists how the product could evolve, without a separate trade-offs table', () => {
    render(<ArchitecturePage />);
    expect(screen.queryByRole('table', { name: 'Trade-offs' })).not.toBeInTheDocument();
    const evolve = document.getElementById('evolve')!;
    expect(within(evolve).getByRole('heading', { level: 2 })).toHaveTextContent('Future evolution');
    expect(within(evolve).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Authentication', 'PostgreSQL', 'Background jobs', 'Upload hardening', 'Monitoring',
    ]);
    expect(evolve).toHaveTextContent('Every repository path and package named on this page is checked by an automated test.');
  });
});

describe('navigation to the Architecture page', () => {
  afterEach(() => { window.history.pushState({}, '', '/'); });

  it('opens at /architecture and is linked from the other pages', async () => {
    vi.mocked(api.list).mockResolvedValue([]);
    window.history.pushState({}, '', '/architecture');
    const page = render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Architecture & Tech Stack' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to CSV Files/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /CSV Generator/ })).toHaveAttribute('href', '/generator');
    page.unmount();

    window.history.pushState({}, '', '/');
    const files = render(<App />);
    expect(within(screen.getByRole('navigation', { name: 'Pages' })).getByRole('link', { name: /Architecture/ })).toHaveAttribute('href', '/architecture');
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    files.unmount();

    window.history.pushState({}, '', '/generator');
    render(<App />);
    expect(screen.getByRole('link', { name: /Architecture/ })).toHaveAttribute('href', '/architecture');
  });
});
