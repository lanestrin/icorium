import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ArchitecturePage } from './ArchitecturePage';
import { HOSTED_DESIGN, HOW_IT_WORKS, ROADMAP, TECH } from '../components/architecture/content';
import sectionStyles from '../components/architecture/architecture.module.scss';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: {
  list: vi.fn(), process: vi.fn(), rows: vi.fn(), upload: vi.fn(), compare: vi.fn(), archive: vi.fn(), generate: vi.fn(),
  download: vi.fn(), storageMode: vi.fn(), clearData: vi.fn(),
} }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.storageMode).mockResolvedValue('saved');
});


describe('Architecture & Tech Stack page', () => {
  it('introduces the page and links to every section', () => {
    render(<ArchitecturePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Architecture & Tech Stack' })).toBeInTheDocument();
    expect(screen.getByText('Building a maintainable CSV processing application with a focused, type-safe technology stack.')).toBeInTheDocument();
    expect(screen.getByText(/Choose the simplest technology that meets the requirements/)).toBeInTheDocument();
    const links = within(screen.getByRole('navigation', { name: 'On this page' })).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Overview', 'Tech stack', 'Architecture', 'Decisions', 'Storage', 'Roadmap', 'Evolution', 'Customers and security']);
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
    expect(cards.map((c) => c.querySelector(`.${sectionStyles.tileTitle}`)!.textContent)).toEqual(['Import CSVs', 'Normalize', 'Validate', 'Process', 'Compare', 'Run anywhere']);
  });

  it('shows a tile for each technology, and its reasons, trade-off and files when selected', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    const tiles = within(screen.getByRole('group', { name: 'Technology stack' })).getAllByRole('button');
    expect(tiles.map((t) => t.textContent)).toEqual([
      'React 19UI', 'TypeScriptType safety', 'ViteBuild & dev', 'SassStyling', 'RadixDialog & menu', 'ZodValidation',
      'Papa ParseCSV parsing', 'SheetJSExcel import', 'pdf.jsPDF import', 'Tesseract.jsOCR', 'RechartsCharts', 'LucideIcons', 'SupabaseSign-in', 'VitestTesting', 'StorybookComponent docs', 'IndexedDBFile storage',
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
    tiles[TECH.findIndex((t) => t.name === 'Zod')].focus();
    await user.keyboard('{Enter}');
    expect(within(detail()).getByRole('heading', { level: 3 })).toHaveTextContent('Zod');
  });

  it('draws how data moves through the app, and explains it in six steps', () => {
    render(<ArchitecturePage />);
    const architecture = document.getElementById('architecture')!;
    expect(within(architecture).getByRole('heading', { level: 2 })).toHaveTextContent('How data moves through the app');
    const diagram = within(architecture).getByRole('list', { name: 'Architecture diagram' });
    expect(within(diagram).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'User / BrowserUpload CSVs and use the app', 'ReactFrontend', 'File serviceIn the browser', 'Parse', 'Normalize', 'Validate', 'Process', 'Results', 'Storage',
    ]);
    const steps = within(within(architecture).getByRole('region', { name: 'How it works' })).getAllByRole('listitem');
    expect(steps.map((s) => s.textContent)).toEqual(HOW_IT_WORKS.map((text, i) => `${i + 1}${text}`));
    expect(within(architecture).queryByRole('button')).not.toBeInTheDocument(); // a picture, not a control
  });

  it('leads the decisions with where processing runs, and keeps each full reasoning one click away', async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    const decisions = document.getElementById('decisions')!;
    const featured = within(decisions).getByRole('article', { name: 'Processing location (browser only)' });
    expect(within(featured).getByRole('list', { name: 'Benefits' }).children).toHaveLength(3);
    expect(featured).toHaveTextContent('Trade-off: one device only');
    expect(featured).toHaveTextContent('No server is involved.');
    expect(within(decisions).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Processing location (browser only)', 'File conversion in the browser', 'Why React and no server?', 'Why TypeScript throughout?', 'Why browser files, then Postgres?',
      'Why a modular pipeline?', 'Why synchronous processing?',
    ]);
    const reasoning = within(decisions).getAllByText('The full reasoning');
    expect(reasoning).toHaveLength(5);
    const details = reasoning[2].closest('details')!;
    expect(details).not.toHaveAttribute('open');
    await user.click(reasoning[2]);
    expect(details).toHaveAttribute('open');
    expect(details).toHaveTextContent('A database becomes worthwhile with users and permissions');
    expect(details).toHaveTextContent('M17 adds exactly that');
  });

  it('explains conversion in use and the limits of OCR', () => {
    render(<ArchitecturePage />);
    const card = screen.getByRole('article', { name: 'File conversion in the browser' });
    for (const text of ['In use', 'Free: no API key', 'Files stay in the browser', 'No server load or Vercel server limits', '10 MB', 'Blurry, skewed, handwritten or merged-cell', 'weak devices', 'no unattended batch runs', 'every converted file needs review', 'Recommended, not built', 'AWS Textract', 'Azure Document Intelligence']) {
      expect(card).toHaveTextContent(text);
    }
  });

  it('separates hosting from storage and says what is not built', () => {
    render(<ArchitecturePage />);
    const storage = document.getElementById('storage')!;
    expect(within(storage).getByRole('heading', { level: 2 })).toHaveTextContent('Hosting and storage');
    const vercel = within(storage).getByRole('list', { name: 'Optional Vercel deployment' });
    expect(vercel).toHaveTextContent('One static site, free on the Hobby plan');
    expect(vercel).toHaveTextContent('Test site: deploys main');
    expect(storage).not.toHaveTextContent(/Vercel Blob|server\/data|Fastify/);
    expect(vercel).toHaveTextContent('Each release also ships as a deployable zip (scripts/build-release.mjs); Production host not chosen yet');
    expect(vercel).toHaveTextContent('Stays static with no functions when Supabase holds signed-in users\' files (planned, 17.4)');
    expect(within(storage).getByRole('img', { name: /Supabase Storage is planned for signed-in users in 17.4/ })).toHaveTextContent(
      'Browser (IndexedDB)In useSupabase StoragePlanned (17.4)S3 / Cloudflare R2At scale');
    expect(storage).toHaveTextContent('list · get · read · patch · create · createAt · put');
  });

  it('lists the planned milestones with each item\x27s status, and the hosted design they build on', () => {
    render(<ArchitecturePage />);
    const roadmap = screen.getByRole('region', { name: 'What is planned next' });
    expect(roadmap).toHaveTextContent('6 · Roadmap');
    expect(within(roadmap).getAllByRole('article').map((card) => within(card).getByRole('heading', { level: 3 }).textContent!.trim())).toEqual([
      'M19 · Universal file ingestion', 'M17 · Invitation-only private workspaces', 'M18 · File deletion and correction', 'Planned hosted design',
    ]);
    for (const milestone of ROADMAP) {
      const items = within(within(roadmap).getByRole('list', { name: `${milestone.milestone} items` })).getAllByRole('listitem');
      expect(items.map((item) => item.querySelector('p')!.textContent)).toEqual(
        milestone.items.map((item) => `${item.id} ${item.title}${item.status}`));
      for (const [i, item] of milestone.items.entries()) expect(items[i]).toHaveTextContent(item.text);
    }
    const design = within(roadmap).getByRole('article', { name: 'Planned hosted design' });
    expect(design).toHaveTextContent('Planned, not provisioned');
    for (const { role, service } of HOSTED_DESIGN.services) {
      expect(within(design).getByText(role).tagName).toBe('DT');
      expect(design).toHaveTextContent(service);
    }
    expect(within(within(design).getByRole('list', { name: 'Accepted free-plan limits' })).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(HOSTED_DESIGN.limits);
    expect(design).toHaveTextContent('pause after a week without use');
    expect(design).toHaveTextContent('supabase/migrations/20261118000000_identity.sql');
    expect(design).toHaveTextContent('they have not been applied to any project yet');
  });

  it('compares the current demo with recommendations at scale', () => {
    render(<ArchitecturePage />);
    const table = screen.getByRole('table', { name: 'Today and at scale' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(8);
    expect(within(rows[0]).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Layer', 'Today', 'At scaleRecommended, not built',
    ]);
    const expected = [
      ['UI', 'React application', 'Same React UI'],
      ['API', 'Browser-local file service', 'Fastify in containers'],
      ['Identity', 'Optional, invitation-only sign-in (Supabase Auth)', 'Managed OIDC provider with customer organizations'],
      ['Data', 'IndexedDB, with memory fallback; Supabase Postgres and Storage planned (17.4)', 'PostgreSQL with row-level security; private S3 or R2 storage via presigned URLs'],
      ['Work', 'Local processing; PDF and OCR conversion workers', 'A queue and workers'],
      ['OCR', 'Tesseract in the browser', 'Managed document AI when volume or accuracy requires it'],
      ['Operations', 'Static hosting, automated tests and CI', 'Logs, Sentry, metrics, a secrets manager and backups'],
    ];
    for (const [index, values] of expected.entries()) {
      expect(within(rows[index + 1]).getByRole('rowheader')).toHaveTextContent(values[0]);
      expect(within(rows[index + 1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(values.slice(1));
    }
  });

  it('presents customer security as future recommendations, not demo guarantees', () => {
    render(<ArchitecturePage />);
    const section = screen.getByRole('region', { name: 'Customers and security' });
    expect(screen.getByRole('link', { name: 'Customers and security' })).toHaveAttribute('href', '#customers');
    for (const text of ['8 · Recommended, not built', 'no secret keys reach the browser and no files leave it', 'teams, sharing and customer organizations are not planned yet', 'multi-tenant', 'dedicated deployment', 'OIDC', 'organizations, SSO and MFA', 'admin, uploader or viewer', 'OAuth client credentials', 'hashed', 'show them once', 'expiring and revocable', 'Rate-limit', 'never plaintext secrets', 'IP allowlisting', 'authenticated session or key', 'storage layer', 'row-level security', 'cross-customer tests', 'quotas', 'content-type checks', 'presigned uploads', 'malware', 'encryption', 'audit log', 'retention', 'formula escaping']) {
      expect(section).toHaveTextContent(text);
    }
  });
});

describe('navigation to the Architecture page', () => {
  afterEach(() => { window.history.pushState({}, '', '/'); });

  it('opens at /architecture and is linked from the other pages', async () => {
    vi.mocked(api.list).mockResolvedValue([]);
    window.history.pushState({}, '', '/architecture');
    const page = render(<App />);
    // The page is loaded on demand, so it appears after a moment.
    expect(await screen.findByRole('heading', { level: 1, name: 'Architecture & Tech Stack' })).toBeInTheDocument();
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
    expect(await screen.findByRole('link', { name: /Architecture/ })).toHaveAttribute('href', '/architecture');
  });
});
