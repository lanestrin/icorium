import { Atom, Boxes, Braces, ChartColumn, Cloud, Code2, Database, FileCog, FileSpreadsheet, FileText, FlaskConical, Laptop, Layers, Server, Settings, Shapes, ShieldCheck, Upload, User, Users, Wind, Workflow, Zap, type LucideIcon } from 'lucide-react';

// Everything the Architecture page says, kept as data so the section components only lay it out.
// pages/architecture-content.test.ts checks every path and package named here against the repository.
type Workspace = 'client' | 'server';

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
    tradeoff: 'A single-page app with no server rendering: data loads after the page does. That is fine for an internal tool.',
    files: ['client/src/App.tsx', 'client/src/pages', 'client/src/components', 'client/src/hooks'],
  },
  {
    name: 'TypeScript', label: 'TypeScript', role: 'Type safety', icon: Code2, packages: [['client', 'typescript'], ['server', 'typescript']],
    why: [
      'One language and static types on both sides of the API.',
      'Shared contracts: FileMeta, CompareResult and the processor list live in one file both sides import.',
      'Renaming a field breaks the build in every place that uses it, not at runtime.',
    ],
    tradeoff: 'Types disappear at runtime, so request bodies still need runtime validation (Zod).',
    files: ['shared/types.ts'],
  },
  {
    name: 'Vite', label: 'Vite', role: 'Build & dev', icon: Zap, packages: [['client', 'vite']],
    why: [
      'Fast dev server with hot reload, and a small config: React, Tailwind and an /api proxy to the local API.',
      'A plain single-page build without the conventions of a larger full-stack framework.',
    ],
    tradeoff: 'No built-in router or server. The app picks its pages from the URL itself, and the API is a separate service.',
    files: ['client/vite.config.ts'],
  },
  {
    name: 'Tailwind CSS 4', label: 'Tailwind CSS', role: 'Styling', icon: Wind, packages: [['client', 'tailwindcss'], ['client', '@tailwindcss/vite']],
    why: [
      'Utility classes keep spacing, colour and type consistent; short ones stay in the markup.',
      'Longer combinations become named classes with @apply: shared ones in styles/components.css, the rest in each feature’s CSS Module.',
      'No large UI component framework to learn, theme or override.',
    ],
    tradeoff: 'A style can live in two places, the markup or a CSS Module; consistency relies on shared classes rather than a component library.',
    files: ['client/src/index.css', 'client/src/styles/components.css'],
  },
  {
    name: 'Fastify 5', label: 'Fastify 5', role: 'API', icon: Server, packages: [['server', 'fastify'], ['server', '@fastify/multipart']],
    why: [
      'A lightweight HTTP API; routes are registered as a plugin under /api.',
      'The multipart plugin handles CSV uploads, capped at 10 MB per file by default (MAX_UPLOAD_MB).',
      'One error handler turns validation and processing errors into clear messages with the right status code.',
    ],
    tradeoff: 'A second service to run and deploy alongside the frontend; locally, npm run dev starts both.',
    files: ['server/src/app.ts', 'server/src/routes/files.ts'],
  },
  {
    name: 'Zod', label: 'Zod', role: 'Validation', icon: ShieldCheck, packages: [['server', 'zod']],
    why: [
      'Runtime validation of request bodies and query strings: process, archive, compare and generate.',
      'Explicit input contracts with plain-language error messages.',
      'Covers what TypeScript cannot: data arriving from outside the program.',
    ],
    tradeoff: 'Request schemas are a second definition beside the TypeScript types. The allowed functions and partners come from the shared lists, but field rules such as limits and messages are written in the schemas.',
    files: ['server/src/routes/files.ts'],
  },
  {
    name: 'Papa Parse', label: 'Papa Parse', role: 'CSV parsing', icon: FileSpreadsheet, packages: [['server', 'papaparse']],
    why: [
      'Parses uploads and writes result CSVs, including quoting and escaping.',
      'Reports malformed rows, which become clear upload errors.',
      'Avoids writing and maintaining a custom CSV parser.',
    ],
    tradeoff: 'Each file is parsed in memory, which suits interview-sized files rather than very large ones.',
    files: ['server/src/lib/csv.ts'],
  },
  {
    name: 'Recharts', label: 'Recharts', role: 'Charts', icon: ChartColumn, packages: [['client', 'recharts']],
    why: [
      'React chart components for the comparison dashboard: one line per file, grouped bars for categories.',
      'Enough for comparing 2–5 results without a complex visualization framework.',
    ],
    tradeoff: 'Another sizeable dependency in a client that ships as one bundle; the production build already warns that it is over 500 kB.',
    files: ['client/src/components/compare/RowChart.tsx', 'client/src/components/compare/CategoryChart.tsx'],
  },
  {
    name: 'Lucide', label: 'Lucide', role: 'Icons', icon: Shapes, packages: [['client', 'lucide-react']],
    why: ['Consistent, lightweight icons; only the icons a file imports are bundled.'],
    tradeoff: 'One more dependency, for icons alone.',
    files: ['client/src/components/files/FileTable.tsx'],
  },
  {
    name: 'Vitest + React Testing Library', label: 'Vitest', role: 'Testing', icon: FlaskConical,
    packages: [['client', 'vitest'], ['server', 'vitest'], ['client', '@testing-library/react'], ['client', '@testing-library/user-event']],
    why: [
      'Server unit tests for calculations and validation rules, and API tests through the real Fastify app.',
      'Component tests for user-visible behaviour: selection, dialogs, keyboard use, failures and retries.',
      'npm run verify runs them all plus the client type-check and build, locally and in CI.',
    ],
    tradeoff: 'Component tests run in jsdom: they check behaviour, not real-browser layout or chart drawing.',
    files: ['server/src/core.test.ts', 'server/src/api.test.ts', 'client/src/pages/FilesPage.test.tsx'],
  },
  {
    name: 'Local filesystem / Vercel Blob', label: 'Files / Blob', role: 'File storage', icon: Database, packages: [['server', '@vercel/blob']],
    why: [
      'Simple persistence for CSV files and their metadata, matched to the scope.',
      'Local folder during development; private Vercel Blob when deployed to Vercel.',
      'One storage module is the only code that touches disk; processing never does.',
    ],
    tradeoff: 'Listing reads every file record: fine for a small catalogue, not for thousands of files or relational queries.',
    files: ['server/src/lib/storage.ts', 'server/src/lib/blob-storage.ts'],
  },
];

/** The components data moves through, in order: the person first, then two rows of four. */
export const PIPELINE: { title: string; sub?: string; icon: LucideIcon }[] = [
  { title: 'User / Browser', sub: 'Upload CSVs and use the app', icon: User },
  { title: 'React', sub: 'Frontend', icon: Atom },
  { title: 'Fastify', sub: 'API', icon: Zap },
  { title: 'Parse', icon: FileText },
  { title: 'Normalize', icon: Layers },
  { title: 'Validate', icon: ShieldCheck },
  { title: 'Process', icon: Settings },
  { title: 'Results', icon: ChartColumn },
  { title: 'Storage', icon: Database },
];

/** The same path in words, beside the diagram. */
export const HOW_IT_WORKS = [
  'Upload CSVs in the browser.',
  'React handles the UI and sends each request to the API.',
  'The Fastify API checks every request.',
  'Each file is parsed, normalized to one record per row and validated.',
  'A processing function adds its columns; results can be previewed, downloaded and compared.',
  'Files are stored by File ID, locally or in Vercel Blob.',
];

/** The decision shown first and in full: where the CSV work runs. */
export const PROCESSING_LOCATION = {
  title: 'Processing location (server vs. browser)',
  text: 'A server-side API parses, normalizes, validates and processes every CSV; the browser only uploads, shows and downloads.',
  benefits: ['Centralized, consistent processing', 'Easier to add business rules and integrations', 'Works across devices with a simple UI'],
  tradeoff: 'Uploads and processing need the API running and reachable. If it is down, or the person is offline, files cannot be processed.',
};

export const DECISIONS: { question: string; icon: LucideIcon; summary: string; answer: string[] }[] = [
  { question: 'Why React + Fastify?', icon: Code2,
    summary: 'A fast, simple stack that covers what the UI and API need, without server rendering the app does not use.', answer: [
    'The app is one interactive screen plus two supporting pages, backed by a CSV-processing API. It needs no server rendering, no SEO and no file-based routing, which are where Next.js shines.',
    'Keeping the API as its own Fastify service puts all parsing, validation and calculation on the server, behind an explicit /api contract that is tested directly. The frontend stays a plain static bundle.',
    'Next.js would also work well; it simply was not necessary here, and a separate API keeps the processing logic independent of how the UI is built.',
  ] },
  { question: 'Why TypeScript throughout?', icon: Braces,
    summary: 'Shared types, fewer bugs and one consistent codebase on both sides of the API.', answer: [
    'The client and server import the same types from shared/types.ts, so a field added to a response is checked everywhere it is read.',
    'API contracts are clearer: the comparison response, generated files and file metadata each have one definition. Zod then validates what actually arrives at runtime.',
  ] },
  { question: 'Why files over PostgreSQL?', icon: Database,
    summary: 'The app needs no database yet: CSV files plus a little metadata keep it simple and light.', answer: [
    'The primary data is CSV files plus a little metadata per file. The exercise needs no relational queries, user accounts or multi-step transactions.',
    'Files keep the originals byte-for-byte, are easy to inspect and reset, and need no database to install for a local demo.',
    'A database becomes worthwhile with users and permissions, searching or reporting across many files, audit history, or many concurrent writers.',
  ] },
  { question: 'Why a modular pipeline?', icon: Boxes,
    summary: 'Separate steps (parse, normalize, validate, process) keep the code clear and easy to extend.', answer: [
    'Parsing, partner normalization, validation and the three functions are separate steps. Adapters absorb each partner’s column names and units, so processing only ever sees one normalized record.',
    'A new partner format is one entry in the adapter list. A new calculation is one processor that declares its columns, plus its entry in the shared processor list, which the API’s allowed values come from.',
    'Validation is shared, so every function treats bad rows the same way and the rules are tested once.',
  ] },
  { question: 'Why synchronous processing?', icon: Zap,
    summary: 'Files are small and calculations fast, so doing the work inside the request keeps the system simple to run.', answer: [
    'Each request parses, processes and saves one file and returns the result. The demo files are small: the samples have 25 rows and generated files are capped at 5,000. At that size, doing the work inside the request keeps things simple, and the UI shows a spinner per file while it runs.',
    'It keeps the system simple: no queue, worker or job status to build or explain.',
    'Large files, many concurrent users or long-running calculations would motivate background jobs: accept the upload, process on a worker and let the UI poll or be notified.',
  ] },
];

export const EVOLVE: { title: string; icon: LucideIcon; text: string }[] = [
  { title: 'Authentication', icon: Users, text: 'User accounts and partner permissions' },
  { title: 'PostgreSQL', icon: Database, text: 'Searchable metadata and audit history' },
  { title: 'Background jobs', icon: Workflow, text: 'Process large files asynchronously' },
  { title: 'Upload hardening', icon: ShieldCheck, text: 'Rate limits, quotas and file safeguards' },
  { title: 'Monitoring', icon: ChartColumn, text: 'Logs, error tracking and alerts' },
];

/** Storage backends in the order they apply: built ones first, then the possible next one. */
export const STORAGE_OPTIONS: { name: string; icon: LucideIcon; note: string; built: boolean }[] = [
  { name: 'Local filesystem', icon: Laptop, note: 'Default', built: true },
  { name: 'Vercel Blob', icon: Cloud, note: 'When a token is set', built: true },
  { name: 'S3 / Cloudflare R2', icon: Boxes, note: 'Not built', built: false },
];

/** What the system does, one short card each. */
export const OVERVIEW: [LucideIcon, string, string][] = [
  [Upload, 'Import CSVs', 'Three partner formats and units'],
  [Layers, 'Normalize', 'One shared record per row'],
  [ShieldCheck, 'Validate', 'Shared rules; bad rows kept'],
  [FileCog, 'Process', 'Three functions; originals kept'],
  [ChartColumn, 'Compare', '2–5 results side by side'],
  [Cloud, 'Run anywhere', 'Local or cloud storage'],
];

/** The "On this page" links: each section's id and label, in page order. */
export const SECTIONS = [
  ['overview', 'Overview'], ['stack', 'Tech stack'], ['architecture', 'Architecture'], ['decisions', 'Decisions'],
  ['storage', 'Storage'], ['evolve', 'Evolution'],
] as const;
