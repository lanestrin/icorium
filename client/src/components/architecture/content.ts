import { Atom, BookOpen, Boxes, Braces, ChartColumn, Cloud, Code2, Database, FileCog, FileSpreadsheet, FileText, FlaskConical, Globe, ScanText, Laptop, Layers, Palette, PanelsTopLeft, Settings, Shapes, ShieldCheck, Upload, User, Zap, type LucideIcon } from 'lucide-react';

// Everything the Architecture page says, kept as data so the section components only lay it out.
// pages/architecture-content.test.ts checks every path and package named here against the repository.
type Workspace = 'client' | 'tests';

export interface Tech {
  name: string;
  label: string; // short name on the tile
  role: string; // its purpose, under the label
  icon: LucideIcon;
  packages: [Workspace, string][];
  why: string[];
  tradeoff: string;
  files: string[];
}

export const TECH: Tech[] = [
  {
    name: 'React 19', label: 'React 19', role: 'UI', icon: Atom, packages: [['client', 'react'], ['client', 'react-dom']],
    why: [
      'Component-based UI: the file table, dialogs, comparison dashboard and generator are each one component.',
      'Fits the interactive workflow: selecting rows, processing in turn, confirming warnings, undoing an archive.',
      'A large ecosystem and familiar patterns keep the code maintainable.',
    ],
    tradeoff: 'A single-page app with no server rendering: the files load after the page does. That is fine for an internal tool.',
    files: ['client/src/App.tsx', 'client/src/pages', 'client/src/components', 'client/src/hooks'],
  },
  {
    name: 'TypeScript', label: 'TypeScript', role: 'Type safety', icon: Code2, packages: [['client', 'typescript'], ['tests', 'typescript']],
    why: [
      'One language and static types for the UI, the shared file service and the tests.',
      'Shared contracts: FileMeta, CompareResult and the processor list live in one file the UI and the file service import.',
      'Renaming a field breaks the build in every place that uses it, not at runtime.',
    ],
    tradeoff: 'Types disappear at runtime, so uploaded files and action inputs still need runtime validation (Zod).',
    files: ['shared/types.ts'],
  },
  {
    name: 'Vite', label: 'Vite', role: 'Build & dev', icon: Zap, packages: [['client', 'vite']],
    why: [
      'Fast dev server with hot reload, and a small config: React and built-in Sass support.',
      'A plain static build that any static host can serve, without the conventions of a larger full-stack framework.',
    ],
    tradeoff: 'No built-in router. The app picks its pages from the URL itself, so the build copies index.html for /generator, /architecture and the sign-in pages to keep them loading on a static host.',
    files: ['client/vite.config.ts', 'client/src/lib/pages.ts'],
  },
  {
    name: 'Sass (SCSS Modules)', label: 'Sass', role: 'Styling', icon: Palette, packages: [['client', 'sass']],
    why: [
      'Each component has its own SCSS Module, so class names never clash and styles sit next to the markup they belong to.',
      'Every colour, size and space comes from the design tokens in tokens.css, and a test checks each text colour against its background for WCAG AA contrast.',
      'Vite compiles .scss with no plugin or extra config.',
    ],
    tradeoff: 'More files than utility classes, and a shared pattern needs a deliberate home: a ui/ component, a shared module or a token.',
    files: ['client/src/styles/tokens.css', 'client/src/styles/_mixins.scss', 'client/src/styles/reset.css'],
  },
  {
    name: 'Radix UI', label: 'Radix', role: 'Dialog & menu', icon: PanelsTopLeft,
    packages: [['client', '@radix-ui/react-dialog'], ['client', '@radix-ui/react-dropdown-menu']],
    why: [
      'The dialog and the row ⋯ menu handle focus, Escape, outside clicks and screen-reader roles as the WAI-ARIA patterns describe.',
      'Unstyled, so the app keeps its own look from its SCSS Modules.',
    ],
    tradeoff: 'Two more runtime packages, and their behaviour (portals, where focus returns) has to be learnt rather than written by hand.',
    files: ['client/src/components/modals/Modal.tsx', 'client/src/components/files/RowMenu.tsx'],
  },
  {
    name: 'Zod', label: 'Zod', role: 'Validation', icon: ShieldCheck, packages: [['client', 'zod']],
    why: [
      'Runtime validation of every file action\x27s input: process, archive, rows, compare and generate.',
      'Explicit input contracts with plain-language error messages.',
      'Covers what TypeScript cannot: data arriving from outside the program.',
    ],
    tradeoff: 'The schemas are a second definition beside the TypeScript types. The allowed functions and partners come from the shared lists, but field rules such as limits and messages are written in the schemas.',
    files: ['shared/file-service.ts'],
  },
  {
    name: 'Papa Parse', label: 'Papa Parse', role: 'CSV parsing', icon: FileSpreadsheet, packages: [['client', 'papaparse']],
    why: [
      'Parses uploads and writes result CSVs, including quoting and escaping.',
      'Reports malformed rows, which become clear upload errors.',
      'Avoids writing and maintaining a custom CSV parser.',
    ],
    tradeoff: 'Each file is parsed in the browser\x27s memory, which suits interview-sized files rather than very large ones.',
    files: ['shared/csv.ts'],
  },
  {
    name: 'SheetJS', label: 'SheetJS', role: 'Excel import', icon: FileSpreadsheet, packages: [['client', 'xlsx']],
    why: [
      'Reads the first sheet of a partner\x27s .xlsx or .xls file in the browser; the rows are reviewed, then uploaded as a CSV, so the file service stays CSV-only.',
      'Loaded only when an Excel file is chosen, so opening the file page does not download it.',
    ],
    tradeoff: 'Installed from SheetJS\x27s own download site (cdn.sheetjs.com), because the npm release is older and has security advisories; installs need that site to be reachable.',
    files: ['client/src/lib/convert/excel.ts', 'client/src/lib/convert/table.ts'],
  },
  {
    name: 'pdf.js', label: 'pdf.js', role: 'PDF import', icon: FileText, packages: [['client', 'pdfjs-dist']],
    why: [
      'Reads the text of a partner\x27s PDF in the browser; text is grouped into rows by its height on the page and into cells by the gaps between it, then reviewed and uploaded as a CSV.',
      'Loaded only when a PDF is chosen, and parses in its own worker so the page stays responsive.',
    ],
    tradeoff: 'Rows and cells are inferred from where the text sits, so unusual layouts need the review; a scanned page has no text, so it is drawn and passed to OCR.',
    files: ['client/src/lib/convert/pdf.ts', 'client/src/lib/convert/layout.ts'],
  },
  {
    name: 'Tesseract.js', label: 'Tesseract.js', role: 'OCR', icon: ScanText, packages: [['client', 'tesseract.js']],
    why: [
      'Reads scanned PDF pages and .png or .jpg photos of a table in the browser, in a Web Worker, so no file is sent to an OCR or AI service.',
      'Its words go through the same row and cell rules as text PDFs; the review then warns "Read by OCR: check the numbers".',
      'The worker and core are served by this site; only the English language data (about 10 MB) comes from a CDN, the first time.',
    ],
    tradeoff: 'OCR can misread digits and decimal points, so every OCR import needs checking; large scans are slow on weak devices, and the first use needs a 10 MB download.',
    files: ['client/src/lib/convert/ocr.ts'],
  },
  {
    name: 'Recharts', label: 'Recharts', role: 'Charts', icon: ChartColumn, packages: [['client', 'recharts']],
    why: [
      'React chart components for the comparison dashboard: one line per file, grouped bars for categories.',
      'Enough for comparing 2–5 results without a complex visualization framework.',
    ],
    tradeoff: 'The largest dependency in the client, so the comparison dialog and its charts are downloaded only when Compare is first used, not when the file page opens.',
    files: ['client/src/components/compare/RowChart.tsx', 'client/src/components/compare/CategoryChart.tsx'],
  },
  {
    name: 'Lucide', label: 'Lucide', role: 'Icons', icon: Shapes, packages: [['client', 'lucide-react']],
    why: ['Consistent, lightweight icons; only the icons a file imports are bundled.'],
    tradeoff: 'One more dependency, for icons alone.',
    files: ['client/src/components/files/FileTable.tsx'],
  },
  {
    name: 'Supabase Auth', label: 'Supabase', role: 'Sign-in', icon: User, packages: [['client', '@supabase/supabase-js']],
    why: [
      'Invitation-only accounts with email and password or Google, password recovery and sign-out, from one managed free service (build-plan 17.1).',
      'The SQL in supabase/ decides who may sign up: a "Before User Created" hook rejects any email without a pending invitation, and row-level security limits each profile to its owner.',
      'The browser holds only the public publishable key, never a secret, and loads the client only on a site with Supabase settings, so the demo downloads none of it.',
    ],
    tradeoff: 'Sign-in works but is not required yet, no Supabase project has been set up, and files still stay in the browser: cloud files arrive in 17.4. Supabase\x27s free plan pauses a project after a week without use.',
    files: ['client/src/lib/supabase.ts', 'client/src/lib/auth.ts', 'client/src/hooks/useAccount.ts', 'supabase/migrations/20261118000000_identity.sql'],
  },
  {
    name: 'Vitest + React Testing Library', label: 'Vitest', role: 'Testing', icon: FlaskConical,
    packages: [['client', 'vitest'], ['tests', 'vitest'], ['client', '@testing-library/react'], ['client', '@testing-library/user-event']],
    why: [
      'Unit tests for calculations and validation rules, and tests of every file action through the real file service with the sample files.',
      'Component tests for user-visible behaviour: selection, dialogs, keyboard use, failures and retries.',
      'npm run verify runs them all plus the client type-check and build, locally and in CI.',
    ],
    tradeoff: 'Component tests run in jsdom, and storage tests use fake-indexeddb: they check behaviour, not real-browser layout, chart drawing or a real browser\x27s storage.',
    files: ['tests/core.test.ts', 'tests/file-actions.test.ts', 'client/src/pages/FilesPage.test.tsx'],
  },
  {
    name: 'Storybook 10', label: 'Storybook', role: 'Component docs', icon: BookOpen,
    packages: [['client', 'storybook'], ['client', '@storybook/react-vite']],
    why: [
      'Shows every shared component (ui/, the banner, the dialog and the row menu) in each variant, size and state, with notes on when to use it.',
      'A Vitest test renders every story and runs its play function, so a story or interaction that no longer matches its component fails npm run verify.',
    ],
    tradeoff: 'A development-only tool with its own build (npm run build-storybook, which CI runs on every PR), kept out of the app and the release zip.',
    files: ['client/.storybook/main.ts', 'client/src/components/ui/Button.stories.tsx', 'client/src/components/stories.test.tsx'],
  },
  {
    name: 'IndexedDB', label: 'IndexedDB', role: 'File storage', icon: Database, packages: [],
    why: [
      'Files and results stay in the person\x27s browser, so the demo costs nothing to run and no file leaves the device.',
      'Built into every browser, and it survives a refresh; memory is the fallback when a browser blocks it.',
      'Every storage implements one Storage interface, so the planned Supabase backend (17.4) can sit behind it without changing processing or the UI.',
    ],
    tradeoff: 'Files live on one device only: there is no sharing, and clearing browser data (or Clear my data) removes them. Tests use fake-indexeddb, not a real browser.',
    files: ['shared/storage.ts', 'client/src/lib/browser-storage.ts'],
  },
];

/** The components data moves through, in order: the person first, then two rows of four. */
export const PIPELINE: { title: string; sub?: string; icon: LucideIcon }[] = [
  { title: 'User / Browser', sub: 'Upload CSVs and use the app', icon: User },
  { title: 'React', sub: 'Frontend', icon: Atom },
  { title: 'File service', sub: 'In the browser', icon: Zap },
  { title: 'Parse', icon: FileText },
  { title: 'Normalize', icon: Layers },
  { title: 'Validate', icon: ShieldCheck },
  { title: 'Process', icon: Settings },
  { title: 'Results', icon: ChartColumn },
  { title: 'Storage', icon: Database },
];

/** The same path in words, beside the diagram. */
export const HOW_IT_WORKS = [
  'Upload CSVs in the browser; an Excel file is converted to CSV there, after a review.',
  'React handles the UI and calls the file service in the same page.',
  'The file service checks every action with Zod.',
  'Each file is parsed, normalized to one record per row and validated.',
  'A processing function adds its columns; results can be previewed, downloaded and compared.',
  'Files are stored by File ID in the browser\x27s IndexedDB.',
];

/** The decision shown first and in full: where the CSV work runs. */
export const PROCESSING_LOCATION = {
  title: 'Processing location (browser only)',
  icon: Laptop,
  tradeoffTitle: 'one device only',
  text: 'The browser does everything: it parses, normalizes, validates and processes every CSV, keeps the files in IndexedDB, and converts Excel and PDF files to CSV before upload. No server is involved.',
  benefits: ['Free to host: any static site works', 'No file ever leaves the person\x27s device', 'Nothing to run or maintain besides the page'],
  tradeoff: 'Files live in one browser on one device, and they are lost when the person clears their browser data. Planned in 17.4: invited accounts keep their files in private Supabase storage, so they reach every device, while processing stays in the browser.',
};

export const CONVERSION = {
  title: 'File conversion in the browser',
  icon: ScanText,
  status: 'In use',
  text: 'Excel, text PDFs, scanned PDFs and images become CSV in the browser, after a review. The worker and core assets come from this site; only English language data (about 10 MB) comes from a CDN on first use.',
  benefits: ['Free: no API key', 'Files stay in the browser', 'No server load or Vercel server limits'],
  tradeoffTitle: 'OCR needs review',
  tradeoff: 'Blurry, skewed, handwritten or merged-cell scans are harder to read. Many pages or weak devices make OCR slow. There are no unattended batch runs: every converted file needs review, especially digits and decimal points.',
  recommendation: 'Recommended, not built',
  next: 'Switch to a managed document-AI service such as AWS Textract or Azure Document Intelligence when volume or accuracy targets require it.',
};

export const DECISIONS: { question: string; icon: LucideIcon; summary: string; answer: string[] }[] = [
  { question: 'Why React and no server?', icon: Code2,
    summary: 'A fast, simple stack that covers what the UI needs, with no server to run or pay for.', answer: [
    'The app is one interactive screen plus two supporting pages. It needs no server rendering, no SEO and no file-based routing, which are where Next.js shines.',
    'All parsing, validation and calculation is plain TypeScript in shared/, run by a file service over one Storage interface, and tested directly. The app is a static bundle any host can serve, at no cost.',
    'Accounts and cross-device files (M17) come from managed Supabase services rather than a server of our own: Auth for sign-in, Postgres and Storage behind row-level security, and Edge Functions for Admin actions. Vercel keeps serving one static site.',
    'A server of our own becomes worthwhile with large or shared processing jobs, or with automated uploads from partners.',
  ] },
  { question: 'Why TypeScript throughout?', icon: Braces,
    summary: 'Shared types, fewer bugs and one consistent codebase.', answer: [
    'The UI and the file service import the same types from shared/types.ts, so a field added to a result is checked everywhere it is read.',
    'Contracts are clearer: the comparison result, generated files and file metadata each have one definition. Zod then validates what actually arrives at runtime.',
  ] },
  { question: 'Why browser files, then Postgres?', icon: Database,
    summary: 'CSV files plus a little metadata need no database, until accounts need private files on every device.', answer: [
    'The primary data is CSV files plus a little metadata per file. The demo needs no relational queries or multi-step transactions, so it keeps them in the browser.',
    'Files keep the originals byte-for-byte, are easy to inspect and reset (Clear my data), and need no database to install or host.',
    'A database becomes worthwhile with users and permissions. M17 adds exactly that, so it adds Supabase Postgres: the CSVs go to a private Storage bucket, and Postgres holds their metadata, the per-owner File ID counter and the row-level security that keeps each owner\x27s files private.',
  ] },
  { question: 'Why a modular pipeline?', icon: Boxes,
    summary: 'Separate steps (parse, normalize, validate, process) keep the code clear and easy to extend.', answer: [
    'Parsing, partner normalization, validation and the three functions are separate steps. Adapters absorb each partner’s column names and units, so processing only ever sees one normalized record.',
    'A new partner format is one entry in the adapter list. A new calculation is one processor that declares its columns, plus its entry in the shared processor list, which the file service’s allowed values come from.',
    'Validation is shared, so every function treats bad rows the same way and the rules are tested once.',
  ] },
  { question: 'Why synchronous processing?', icon: Zap,
    summary: 'Files are small and calculations fast, so doing the work straight away keeps the system simple.', answer: [
    'Each action parses, processes and saves one file and returns the result. The demo files are small: the samples have 25 rows and generated files are capped at 5,000. At that size, doing the work straight away keeps things simple, and the UI shows a spinner per file while it runs.',
    'It keeps the system simple: no queue, worker or job status to build or explain.',
    'Large files would motivate a Web Worker, so the page stays responsive; long-running or shared processing would motivate background jobs on a backend.',
  ] },
];

export const SCALE = {
  status: 'Recommended, not built',
  rows: [
    { layer: 'UI', today: 'React application', future: 'Same React UI' },
    { layer: 'API', today: 'Browser-local file service', future: 'Fastify in containers' },
    { layer: 'Identity', today: 'Optional, invitation-only sign-in (Supabase Auth)', future: 'Managed OIDC provider with customer organizations' },
    { layer: 'Data', today: 'IndexedDB, with memory fallback; Supabase Postgres and Storage planned (17.4)', future: 'PostgreSQL with row-level security; private S3 or R2 storage via presigned URLs' },
    { layer: 'Work', today: 'Local processing; PDF and OCR conversion workers', future: 'A queue and workers' },
    { layer: 'OCR', today: 'Tesseract in the browser', future: 'Managed document AI when volume or accuracy requires it' },
    { layer: 'Operations', today: 'Static hosting, automated tests and CI', future: 'Logs, Sentry, metrics, a secrets manager and backups' },
  ],
};

export const CUSTOMER_SECURITY = {
  status: 'Recommended, not built',
  today: 'Today this is a static demo with optional sign-in that nothing requires yet: no secret keys reach the browser and no files leave it. M17 adds private workspaces for invited individuals only; teams, sharing and customer organizations are not planned yet. The following describes a future hosted product, not safeguards implemented in this demo.',
  topics: [
    { title: 'One hosted product', text: 'Use one hosted multi-tenant app rather than copies customers download. Offer a dedicated deployment only when a contract needs it.' },
    { title: 'People and roles', text: 'Use a managed OIDC provider with customer organizations, SSO and MFA. Give people admin, uploader or viewer roles within their customer.' },
    { title: 'Automated uploads', text: 'Use per-customer OAuth client credentials or scoped API keys. Store API keys hashed, show them once, and make them expiring and revocable. Rate-limit requests and log key usage, never plaintext secrets.' },
    { title: 'IP allowlisting', text: 'Optional IP allowlisting adds a layer; it never replaces authenticated identity.' },
    { title: 'Customer isolation', text: 'Derive the customer ID from the authenticated session or key, never an untrusted customer field. Enforce customer isolation in the storage layer, reinforced by PostgreSQL row-level security and cross-customer tests.' },
    { title: 'Upload safeguards', text: 'Apply quotas and rate limits, content-type checks and presigned uploads to private per-customer storage. Scan stored PDFs and images for malware. Add encryption, an audit log, retention rules and formula escaping for files shared outside.' },
  ],
};

/** Storage backends in the order they apply: built ones first, then the possible next one. */
export const STORAGE_OPTIONS: { name: string; icon: LucideIcon; note: string; built: boolean }[] = [
  { name: 'Browser (IndexedDB)', icon: Laptop, note: 'In use', built: true },
  { name: 'Supabase Storage', icon: Cloud, note: 'Planned (17.4)', built: false },
  { name: 'S3 / Cloudflare R2', icon: Boxes, note: 'At scale', built: false },
];

export type RoadmapStatus = 'Done' | 'Next' | 'Planned';

/**
 * The approved next scope from blueprint/build-plan.md (M19, M17, M18, in plan order), one entry per build-plan item.
 * pages/architecture-content.test.ts checks every ID and its Done status against the plan's checkboxes.
 */
export const ROADMAP: { milestone: string; title: string; goal: string; items: { id: string; title: string; status: RoadmapStatus; text: string }[] }[] = [
  {
    milestone: 'M19', title: 'Universal file ingestion',
    goal: 'Supplier files in any column layout are mapped, unit-checked and validated before any calculation, and every result traces to its source.',
    items: [
      { id: '19.1', title: 'Structured validation issues', status: 'Next', text: 'Issues carry a severity (blocking, warning or info), field, row and source; a missing component is never counted as zero.' },
      { id: '19.2', title: 'Layered header matching', status: 'Planned', text: 'Exact, normalized, alias and manual matching; two candidates for one field are reported, never picked silently.' },
      { id: '19.3', title: 'Unit verification', status: 'Planned', text: 'Units come from the header, a supplier profile or confirmation, never from value ranges; each conversion factor is recorded.' },
      { id: '19.4', title: 'Stored mapping and processing gate', status: 'Planned', text: 'Unrecognized files are kept as Needs Mapping; the file service refuses to process anything not mapped, unit-confirmed and validated.' },
      { id: '19.5', title: 'Import review and mapping', status: 'Planned', text: 'One review step for every file type: headers, suggested mapping, units, row counts, and why processing is blocked.' },
      { id: '19.6', title: 'Excel sheets, tables and formulas', status: 'Planned', text: 'Every sheet, a choice between candidate tables, total and note rows told apart, and formula values flagged.' },
      { id: '19.7', title: 'PDF and OCR safeguards', status: 'Planned', text: 'Page numbers, repeated headers, misaligned cells, OCR confidence and ambiguous numbers flagged for confirmation.' },
      { id: '19.8', title: 'Provenance and traceability', status: 'Planned', text: 'The original file and source cells are kept, and a calculated value can be explained from its raw source value.' },
      { id: '19.9', title: 'Ingestion regression and docs', status: 'Planned', text: 'A test for every acceptance criterion, regression for existing files and results, and updated documentation.' },
    ],
  },
  {
    milestone: 'M17', title: 'Invitation-only private workspaces',
    goal: 'Invited people sign in and keep private files on every device; a guest demo stays open to anyone.',
    items: [
      { id: '17.1', title: 'Free hosted-service design', status: 'Done', text: 'Supabase chosen over Firebase and Appwrite: the only free plan that met invite-only sign-in, private files and access to existing files without a card.' },
      { id: '17.2', title: 'Sign-in and activation', status: 'Done', text: 'Invite-only database rules, then sign-in, activation, password recovery and sign-out pages. Sign-in is optional until 17.6.' },
      { id: '17.3', title: 'Admin invitations and access', status: 'Planned', text: 'Invite by email (30-day expiry, resend, extend, revoke), change roles, deactivate and reactivate. An Admin cannot read members\x27 files.' },
      { id: '17.4', title: 'Private cross-device files', status: 'Planned', text: 'Files, results and metadata in Supabase, checked against the signed-in owner on every action; uploads refused at capacity.' },
      { id: '17.5', title: 'Guest demo and export', status: 'Planned', text: 'Try the demo signs in with demo credentials; each demo gets isolated, temporary browser data with sample files, cleared when it ends. Files already in the browser can be exported.' },
      { id: '17.6', title: 'Require sign-in', status: 'Planned', text: 'The file workspace needs an invited account or a demo session; Admin, Architecture and Generator pages are Admin-only.' },
      { id: '17.7', title: 'Hosted verification', status: 'Planned', text: 'Real evidence on a non-production project: invitations, both sign-in methods, cross-device files, isolation and deactivation.' },
    ],
  },
  {
    milestone: 'M18', title: 'File deletion and correction',
    goal: 'Owners remove files for good and fix flagged values without losing the original.',
    items: [
      { id: '18.1', title: 'Permanent deletion', status: 'Planned', text: 'Delete selected files after a confirmation; an input\x27s results stay, marked as from a deleted source. Archive stays.' },
      { id: '18.2', title: 'Correctable validation cells', status: 'Planned', text: 'Validation names the input cells to edit, and explains issues that cell edits cannot fix.' },
      { id: '18.3', title: 'Fix errors and re-run', status: 'Planned', text: 'Edit flagged cells, save a new linked corrected input and re-run the function; the original and its results are kept.' },
    ],
  },
];

/** The design chosen in 17.1 (blueprint/hosted-services.md): one provider, its free-plan limits accepted. */
export const HOSTED_DESIGN = {
  status: 'Planned, not provisioned',
  services: [
    { role: 'Sign-in and sessions', service: 'Supabase Auth: email and password, Google, and an invite-only sign-up hook' },
    { role: 'Files and metadata', service: 'Supabase Postgres and one private Storage bucket, both behind row-level security' },
    { role: 'Admin actions', service: 'Supabase Edge Functions for invitations, roles and deactivation; they never read files' },
    { role: 'Email', service: 'Supabase custom SMTP through a Gmail sender' },
  ],
  limits: [
    'Free projects pause after a week without use; the app will say the workspace is temporarily unavailable until it is restored.',
    'No backups on the free plan, so regular exports are part of the operating guide (17.7).',
    'One quota shared by every user: 1 GB of files and 500 MB of database. Uploads are refused before it is reached; existing files stay readable.',
    'Gmail sends up to 500 emails a day; a failed invitation email is reported as a failure.',
  ],
};

/** What the system does, one short card each. */
export const OVERVIEW: [LucideIcon, string, string][] = [
  [Upload, 'Import CSVs', 'Three partner formats and units'],
  [Layers, 'Normalize', 'One shared record per row'],
  [ShieldCheck, 'Validate', 'Shared rules; bad rows kept'],
  [FileCog, 'Process', 'Three functions; originals kept'],
  [ChartColumn, 'Compare', '2–5 results side by side'],
  [Globe, 'Run anywhere', 'Any static host; files stay in the browser'],
];

/** The "On this page" links: each section's id and label, in page order. */
export const SECTIONS = [
  ['overview', 'Overview'], ['stack', 'Tech stack'], ['architecture', 'Architecture'], ['decisions', 'Decisions'],
  ['storage', 'Storage'], ['roadmap', 'Roadmap'], ['evolve', 'Evolution'], ['customers', 'Customers and security'],
] as const;
