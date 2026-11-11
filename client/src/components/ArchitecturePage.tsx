import { useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, Boxes, Braces, CheckCircle2, Cloud, Code2, Database, FileCog, FileInput, FileOutput, FileSpreadsheet,
  FlaskConical, GitCompare, HardDrive, Layers, LayoutGrid, MonitorSmartphone, Palette, Scale, Server, ShieldCheck, Shapes,
  Sparkles, Split, TestTubes, Wand2, Workflow, Zap, type LucideIcon,
} from 'lucide-react';

/*
 * Architecture & Tech Stack page (/architecture), for walking through the design in an interview.
 * Every repository path and package named here is checked by client/src/architecture-content.test.ts,
 * so the page cannot drift from the code without a failing test.
 */

type Workspace = 'client' | 'server';

export interface Tech {
  name: string;
  role: string;
  icon: LucideIcon;
  packages: [Workspace, string][];
  why: string[];
  tradeoff: string;
  files: string[];
}

export const TECH: Tech[] = [
  {
    name: 'React 19', role: 'Frontend', icon: MonitorSmartphone, packages: [['client', 'react'], ['client', 'react-dom']],
    why: [
      'Component-based UI: the file table, dialogs, comparison dashboard and generator are each one component.',
      'Fits the interactive workflow: selecting rows, processing in turn, confirming warnings, undoing an archive.',
      'A large ecosystem and familiar patterns keep the code maintainable.',
    ],
    tradeoff: 'A single-page app with no server rendering: data loads after the page does. That is fine for an internal tool.',
    files: ['client/src/App.tsx', 'client/src/components'],
  },
  {
    name: 'TypeScript', role: 'Shared language', icon: Code2, packages: [['client', 'typescript'], ['server', 'typescript']],
    why: [
      'One language and static types on both sides of the API.',
      'Shared contracts: FileMeta, CompareResult and the processor list live in one file both sides import.',
      'Renaming a field breaks the build in every place that uses it, not at runtime.',
    ],
    tradeoff: 'Types disappear at runtime, so request bodies still need runtime validation (Zod).',
    files: ['shared/types.ts'],
  },
  {
    name: 'Vite', role: 'Build tool', icon: Zap, packages: [['client', 'vite']],
    why: [
      'Fast dev server with hot reload, and a small config: React, Tailwind and an /api proxy to the local API.',
      'A plain single-page build without the conventions of a larger full-stack framework.',
    ],
    tradeoff: 'No built-in router or server. The app picks its pages from the URL itself, and the API is a separate service.',
    files: ['client/vite.config.ts'],
  },
  {
    name: 'Tailwind CSS 4', role: 'Styling', icon: Palette, packages: [['client', 'tailwindcss'], ['client', '@tailwindcss/vite']],
    why: [
      'Utility classes keep spacing, colour and type consistent without a separate stylesheet per component.',
      'Responsive layouts down to phone width with no extra CSS files.',
      'No large UI component framework to learn, theme or override.',
    ],
    tradeoff: 'Long class lists in the markup; consistency relies on shared patterns rather than a component library.',
    files: ['client/src/index.css'],
  },
  {
    name: 'Fastify 5', role: 'Backend', icon: Server, packages: [['server', 'fastify'], ['server', '@fastify/multipart']],
    why: [
      'A lightweight HTTP API; routes are registered as a plugin under /api.',
      'The multipart plugin handles CSV uploads, capped at 10 MB per file.',
      'One error handler turns validation and processing errors into clear messages with the right status code.',
    ],
    tradeoff: 'A second service to run and deploy alongside the frontend; locally, npm run dev starts both.',
    files: ['server/src/app.ts', 'server/src/routes/files.ts'],
  },
  {
    name: 'Zod', role: 'Validation', icon: ShieldCheck, packages: [['server', 'zod']],
    why: [
      'Runtime validation of request bodies and query strings: process, archive, compare and generate.',
      'Explicit input contracts with plain-language error messages.',
      'Covers what TypeScript cannot: data arriving from outside the program.',
    ],
    tradeoff: 'Schemas sit beside the TypeScript types and must be kept in step, e.g. the processor list.',
    files: ['server/src/routes/files.ts'],
  },
  {
    name: 'Papa Parse', role: 'CSV handling', icon: FileSpreadsheet, packages: [['server', 'papaparse']],
    why: [
      'Parses uploads and writes result CSVs, including quoting and escaping.',
      'Reports malformed rows, which become clear upload errors.',
      'Avoids writing and maintaining a custom CSV parser.',
    ],
    tradeoff: 'Each file is parsed in memory, which suits interview-sized files rather than very large ones.',
    files: ['server/src/lib/csv.ts'],
  },
  {
    name: 'Recharts', role: 'Visualization', icon: GitCompare, packages: [['client', 'recharts']],
    why: [
      'React chart components for the comparison dashboard: one line per file, grouped bars for categories.',
      'Enough for comparing 2–5 results without a complex visualization framework.',
    ],
    tradeoff: 'Another sizeable dependency in a client that ships as one bundle; the production build already warns that it is over 500 kB.',
    files: ['client/src/components/CompareWorkspace.tsx'],
  },
  {
    name: 'Lucide', role: 'Icons', icon: Shapes, packages: [['client', 'lucide-react']],
    why: ['Consistent, lightweight icons; only the icons a file imports are bundled.'],
    tradeoff: 'One more dependency, for icons alone.',
    files: ['client/src/components/FileTable.tsx'],
  },
  {
    name: 'Vitest + React Testing Library', role: 'Testing', icon: TestTubes,
    packages: [['client', 'vitest'], ['server', 'vitest'], ['client', '@testing-library/react'], ['client', '@testing-library/user-event']],
    why: [
      'Server unit tests for calculations and validation rules, and API tests through the real Fastify app.',
      'Component tests for user-visible behaviour: selection, dialogs, keyboard use, failures and retries.',
      'npm run verify runs them all plus the client type-check and build, locally and in CI.',
    ],
    tradeoff: 'Component tests run in jsdom: they check behaviour, not real-browser layout or chart drawing.',
    files: ['server/src/core.test.ts', 'server/src/api.test.ts', 'client/src/App.test.tsx'],
  },
  {
    name: 'Local filesystem / Vercel Blob', role: 'Storage', icon: Database, packages: [['server', '@vercel/blob']],
    why: [
      'Simple persistence for CSV files and their metadata, matched to the scope.',
      'Local folder during development; private Vercel Blob when deployed to Vercel.',
      'One storage module is the only code that touches disk; processing never does.',
    ],
    tradeoff: 'Listing reads every file record: fine for a small catalogue, not for thousands of files or relational queries.',
    files: ['server/src/lib/storage.ts', 'server/src/lib/blob-storage.ts'],
  },
];

export interface ArchNode {
  id: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  detail: string;
  files: string[];
}

export const NODES: ArchNode[] = [
  { id: 'browser', title: 'User / Browser', icon: MonitorSmartphone, summary: 'Chooses files, functions and comparisons',
    detail: 'Everything starts with a person in the browser: uploading partner CSVs, running a processing function, previewing results, comparing files and generating test data.',
    files: [] },
  { id: 'frontend', title: 'React + TypeScript frontend', icon: LayoutGrid, summary: 'File workspace, comparison, generator',
    detail: 'A single-page app with three pages picked from the URL: the file workspace, /generator and /architecture. A typed API client makes every request and turns error responses into readable messages.',
    files: ['client/src/App.tsx', 'client/src/api.ts', 'client/src/components'] },
  { id: 'api', title: 'Fastify REST API', icon: Server, summary: 'Routes, Zod validation, error handling',
    detail: 'All endpoints live under /api: upload, list, preview rows, download, archive, process, compare and generate. Zod checks each request; one error handler returns a status code and a plain message.',
    files: ['server/src/app.ts', 'server/src/routes/files.ts'] },
  { id: 'csv', title: 'CSV parsing', icon: FileInput, summary: 'Papa Parse, header and row checks',
    detail: 'Turns CSV text into headers and rows, rejecting malformed files or files with no data rows, and writes CSVs back out with correct quoting.',
    files: ['server/src/lib/csv.ts'] },
  { id: 'adapters', title: 'Partner normalization', icon: Split, summary: 'Each partner’s columns and units → one record',
    detail: 'An adapter per partner maps its column names and units (kg, lb or g; percentages or fractions) onto one normalized record. A file that matches no adapter is rejected. Adding a partner means adding one adapter entry.',
    files: ['server/src/adapters/index.ts'] },
  { id: 'validation', title: 'Validation', icon: CheckCircle2, summary: 'Shared row rules, invalid rows kept',
    detail: 'The same rules check every row for every function: missing or invalid mass, out-of-range percentages, composition totals outside ±0.5 points, missing or duplicate batch IDs. Invalid rows are kept with their reasons, never corrected silently.',
    files: ['server/src/processing/index.ts'] },
  { id: 'processing', title: 'Processing', icon: FileCog, summary: 'Validation, Mass, Classification',
    detail: 'Three independent functions run on every row: composition validation, component mass calculation and demo-only blend classification. Each declares the columns it adds.',
    files: ['server/src/processing/index.ts'] },
  { id: 'results', title: 'Result generation', icon: FileOutput, summary: 'Original columns + generated columns',
    detail: 'Every original column and value is kept, including the input’s file_id, and the function’s columns are appended, starting with result_id and ending with processing_status and validation_errors. Re-running a function on the same input replaces its earlier result only when the request sends replace: true; otherwise the server answers 409 and names the existing result.',
    files: ['server/src/processing/index.ts', 'server/src/lib/csv.ts'] },
  { id: 'compare', title: 'Comparison', icon: GitCompare, summary: '2–5 results, rows matched by batch ID or position',
    detail: 'Compares 2–5 results of one function column by column. Rows are matched by batch ID when every pair of files shares IDs, otherwise by position, and the response says which. The dashboard draws it with Recharts.',
    files: ['server/src/lib/compare.ts', 'client/src/components/CompareWorkspace.tsx'] },
  { id: 'generator', title: 'CSV generator', icon: Wand2, summary: 'Synthetic partner files, nothing saved',
    detail: 'Makes 1–10 synthetic CSVs in a partner’s own format, with an exact number of rows that fail validation. It saves nothing: the browser downloads the files or uploads them through the normal upload.',
    files: ['server/src/lib/generate.ts', 'client/src/components/GeneratorPage.tsx'] },
  { id: 'storage', title: 'Storage layer', icon: Layers, summary: 'Files keyed by File ID',
    detail: 'The only module that touches persistence. Files are stored and found by File ID (101010, 101010-M), never by name. Routes call the same operations whichever backend is active: list, get, read, patch, create (claims the next ID) and put (writes a result at its ID); the backend is chosen once at startup from the environment.',
    files: ['server/src/lib/storage.ts'] },
  { id: 'local', title: 'Local filesystem', icon: HardDrive, summary: 'server/data: CSV files + meta.json',
    detail: 'Used when no Blob token is set. Each CSV is a file under server/data/files and all metadata is one meta.json. Deleting server/data resets the demo; the five samples load on first start.',
    files: ['server/src/lib/storage.ts'] },
  { id: 'blob', title: 'Vercel Blob (private)', icon: Cloud, summary: 'One private JSON object per file',
    detail: 'Used when BLOB_READ_WRITE_TOKEN is set. Each file and its metadata are one private object named by its File ID; a new ID is claimed with a create-if-absent write, so two servers never hand out the same one, and a new result is saved the same way, so an unconfirmed run never overwrites one. Updates use ETag checks and return 409 on a conflicting change. On Vercel, startup fails rather than fall back to temporary disk.',
    files: ['server/src/lib/blob-storage.ts'] },
  { id: 'shared', title: 'Shared contracts', icon: Braces, summary: 'Types used by client and server',
    detail: 'FileMeta, CompareResult, GeneratedFile, the processor list and the comparison and generator limits are defined once and imported by both sides, so request and response shapes cannot silently diverge.',
    files: ['shared/types.ts'] },
];

export interface Flow { id: string; label: string; steps: { node: string; text: string }[] }

/** What actually happens for each main request, in order (see server/src/routes/files.ts). */
export const FLOWS: Flow[] = [
  { id: 'upload', label: 'Upload', steps: [
    { node: 'browser', text: 'The person drops or chooses CSV files.' },
    { node: 'frontend', text: 'api.upload sends each file to POST /api/files.' },
    { node: 'api', text: 'The route reads the multipart file and checks it is a .csv.' },
    { node: 'csv', text: 'Papa Parse reads headers and rows; malformed files are rejected.' },
    { node: 'adapters', text: 'The headers must match a partner adapter, or the upload is refused.' },
    { node: 'validation', text: 'Every row is checked; the invalid-row count sets Ready or Needs Review.' },
    { node: 'storage', text: 'The CSV is saved under the next File ID, with that ID in a file_id column, and its metadata goes back to the browser.' },
  ] },
  { id: 'process', label: 'Process', steps: [
    { node: 'browser', text: 'The person ticks inputs, picks a function and runs it (after a warning if rows are invalid).' },
    { node: 'frontend', text: 'api.process calls POST /api/process once per file, one file at a time.' },
    { node: 'api', text: 'Zod checks the body; result and archived files are refused.' },
    { node: 'storage', text: 'The input CSV is read from storage.' },
    { node: 'csv', text: 'Its rows are parsed.' },
    { node: 'adapters', text: 'Each row is normalized to kg and percentages.' },
    { node: 'validation', text: 'Each row is validated with the shared rules.' },
    { node: 'processing', text: 'The chosen function calculates valid rows only.' },
    { node: 'results', text: 'Original columns are kept and generated columns appended.' },
    { node: 'storage', text: 'The result CSV is saved as the input’s ID plus the function’s code (101010-M), replacing an earlier run; the browser then previews it via GET /api/files/:id/rows.' },
  ] },
  { id: 'compare', label: 'Compare', steps: [
    { node: 'browser', text: 'The person ticks 2–5 results of one function and clicks Compare.' },
    { node: 'frontend', text: 'api.compare calls GET /api/compare?ids=…' },
    { node: 'api', text: 'Zod checks there are 2–5 different ids.' },
    { node: 'storage', text: 'Each result CSV is read.' },
    { node: 'csv', text: 'Each is parsed, and its result schema detected from its columns.' },
    { node: 'compare', text: 'Rows are matched and per-file summaries, categories and values computed.' },
    { node: 'frontend', text: 'The JSON response is drawn as charts and tables in the comparison dashboard.' },
  ] },
  { id: 'generate', label: 'Generate', steps: [
    { node: 'browser', text: 'The person picks a partner, rows, files and error rows on /generator.' },
    { node: 'frontend', text: 'api.generate calls POST /api/generate.' },
    { node: 'api', text: 'Zod checks the limits: 1–5,000 rows, 1–10 files.' },
    { node: 'generator', text: 'Files are built from the partner adapters’ columns; nothing is stored.' },
    { node: 'frontend', text: 'The browser downloads the files, or adds them through the Upload flow.' },
  ] },
];

const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

const DECISIONS: { question: string; answer: string[] }[] = [
  { question: 'Why React + Fastify instead of Next.js?', answer: [
    'The app is one interactive screen plus two supporting pages, backed by a CSV-processing API. It needs no server rendering, no SEO and no file-based routing, which are where Next.js shines.',
    'Keeping the API as its own Fastify service puts all parsing, validation and calculation on the server, behind an explicit /api contract that is tested directly. The frontend stays a plain static bundle.',
    'Next.js would also work well; it simply was not necessary here, and a separate API keeps the processing logic independent of how the UI is built.',
  ] },
  { question: 'Why TypeScript across the application?', answer: [
    'The client and server import the same types from shared/types.ts, so a field added to a response is checked everywhere it is read.',
    'API contracts are clearer: the comparison response, generated files and file metadata each have one definition. Zod then validates what actually arrives at runtime.',
  ] },
  { question: 'Why file storage instead of PostgreSQL?', answer: [
    'The primary data is CSV files plus a little metadata per file. The exercise needs no relational queries, user accounts or multi-step transactions.',
    'Files keep the originals byte-for-byte, are easy to inspect and reset, and need no database to install for a local demo.',
    'A database becomes worthwhile with users and permissions, searching or reporting across many files, audit history, or many concurrent writers.',
  ] },
  { question: 'Why a modular processing pipeline?', answer: [
    'Parsing, partner normalization, validation and the three functions are separate steps. Adapters absorb each partner’s column names and units, so processing only ever sees one normalized record.',
    'A new partner format is one entry in the adapter list. A new calculation is one processor that declares its columns, plus its name in the shared processor list and the API’s allowed values.',
    'Validation is shared, so every function treats bad rows the same way and the rules are tested once.',
  ] },
  { question: 'Why synchronous processing?', answer: [
    'Each request parses, processes and saves one file and returns the result. The demo files are small: the samples have 25 rows and generated files are capped at 5,000. At that size, doing the work inside the request keeps things simple, and the UI shows a spinner per file while it runs.',
    'It keeps the system simple: no queue, worker or job status to build or explain.',
    'Large files, many concurrent users or long-running calculations would motivate background jobs: accept the upload, process on a worker and let the UI poll or be notified.',
  ] },
];

const TRADEOFFS: [string, string, string][] = [
  ['React + Vite', 'A focused, lightweight frontend with fast feedback', 'A separate API to deploy and configure'],
  ['Fastify', 'A simple, modular backend with clear error handling', 'Backend code and a second service to maintain'],
  ['Filesystem / Blob storage', 'Low infrastructure complexity; originals kept as files', 'Less suitable for relational queries or large catalogues'],
  ['Synchronous processing', 'Straightforward execution and error reporting', 'Limited scalability for large or slow workloads'],
  ['Shared TypeScript types', 'Consistent data structures on both sides', 'Runtime validation (Zod) is still necessary'],
  ['No authentication', 'Less demo complexity; anyone can try every feature', 'Not suitable for unrestricted multi-user production use'],
];

const EVOLVE: { title: string; icon: LucideIcon; text: string }[] = [
  { title: 'Authentication and access control', icon: ShieldCheck, text: 'User accounts, and partner- or team-level access to files. Today the API is unauthenticated and everyone shares one dataset.' },
  { title: 'PostgreSQL for metadata', icon: Database, text: 'Once there are users, audit history or searches across many files, move metadata to a relational database and keep the CSVs in object storage.' },
  { title: 'S3-compatible object storage', icon: Cloud, text: 'If hosting moves away from Vercel, add an S3 or Cloudflare R2 backend behind the same storage interface. Not implemented today.' },
  { title: 'Background jobs and queues', icon: Workflow, text: 'Process large files on workers with job status in the UI, instead of within the request.' },
  { title: 'Upload hardening', icon: FileInput, text: 'Uploads are already limited to 10 MB and checked against a partner schema. Next: rate limiting, per-user quotas and stricter content checks.' },
  { title: 'Monitoring and logging', icon: Sparkles, text: 'Structured request logs, error tracking and alerts. Today the server logs warnings and errors only.' },
];

const SECTIONS = [
  ['overview', 'Overview'], ['stack', 'Tech stack'], ['architecture', 'Architecture'], ['decisions', 'Decisions'],
  ['storage', 'Storage'], ['tradeoffs', 'Trade-offs'], ['evolve', 'Evolution'],
] as const;

const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const H2 = 'text-2xl font-bold tracking-tight';
const Path = ({ children }: { children: string }) => (
  <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{children}</code>
);

function Section({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 pt-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">{eyebrow}</p>
      <h2 id={`${id}-title`} className={`${H2} mt-1`}>{title}</h2>
      {intro && <p className="mt-2 max-w-3xl text-slate-600">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ArchitectureDiagram() {
  const [selected, setSelected] = useState('api');
  const [flowId, setFlowId] = useState('process');
  const flow = FLOWS.find((f) => f.id === flowId)!;
  const inFlow = (id: string) => flow.steps.some((s) => s.node === id);
  const firstStep = (id: string) => flow.steps.findIndex((s) => s.node === id) + 1;
  const node = nodeById(selected);

  const Box = ({ id, compact }: { id: string; compact?: boolean }) => {
    const n = nodeById(id);
    const on = inFlow(id);
    const step = firstStep(id);
    return (
      <button
        type="button"
        aria-pressed={selected === id}
        onClick={() => setSelected(id)}
        className={`relative w-full min-w-0 rounded-xl border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${compact ? 'py-2.5' : 'py-3'}
          ${selected === id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : on ? 'border-blue-200 bg-white hover:bg-blue-50/50' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white'}`}
      >
        {on && (
          <span aria-hidden className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">{step}</span>
        )}
        <span className="flex items-center gap-2 font-semibold">
          <n.icon className={`h-4 w-4 shrink-0 ${on || selected === id ? 'text-blue-600' : 'text-slate-400'}`} aria-hidden />
          <span className="truncate">{n.title}</span>
        </span>
        {!compact && <span className="mt-0.5 block truncate text-xs text-slate-500">{n.summary}</span>}
        <span className="sr-only">{on ? `, step ${step} of the ${flow.label} flow` : ''}</span>
      </button>
    );
  };

  const Link = ({ down, up }: { down: string; up?: string }) => (
    <div className="flex items-center justify-center gap-6 py-1.5 text-xs text-slate-500" aria-hidden>
      <span className="flex items-center gap-1"><ArrowDown className="h-4 w-4 text-slate-400" />{down}</span>
      {up && <span className="flex items-center gap-1"><ArrowUp className="h-4 w-4 text-slate-400" />{up}</span>}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className={CARD}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold">Follow a request</span>
          <div role="group" aria-label="Request flow" className="flex flex-wrap gap-1 rounded-full bg-slate-100 p-1">
            {FLOWS.map((f) => (
              <button key={f.id} type="button" aria-pressed={flowId === f.id} onClick={() => setFlowId(f.id)}
                className={`rounded-full px-3.5 py-1 text-sm font-medium transition ${flowId === f.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div aria-label="Architecture diagram" role="group">
          <div className="mx-auto max-w-sm"><Box id="browser" /></div>
          <Link down="actions" up="pages, charts, downloads" />
          <div className="mx-auto max-w-md"><Box id="frontend" /></div>
          <Link down="JSON / multipart requests to /api" up="JSON responses, CSV downloads" />
          <div className="mx-auto max-w-md"><Box id="api" /></div>
          <Link down="pipeline" />
          <div className="rounded-xl border border-dashed border-slate-300 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Processing pipeline</p>
            <div className="grid gap-2 sm:grid-cols-5">
              {['csv', 'adapters', 'validation', 'processing', 'results'].map((id) => <Box key={id} id={id} compact />)}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Box id="compare" compact />
              <Box id="generator" compact />
            </div>
          </div>
          <Link down="read / save" up="CSV text, metadata" />
          <div className="mx-auto max-w-md"><Box id="storage" /></div>
          <Link down="one backend, chosen at startup" />
          <div className="grid gap-2 sm:grid-cols-2"><Box id="local" /><Box id="blob" /></div>
          <div className="mt-4 border-t border-slate-100 pt-4"><Box id="shared" compact /></div>
        </div>
      </div>

      <div className="space-y-4">
        <section aria-label="Selected component" aria-live="polite" className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected component</p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold"><node.icon className="h-5 w-5 text-blue-600" aria-hidden />{node.title}</h3>
          <p className="mt-2 text-sm text-slate-700">{node.detail}</p>
          {node.files.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Implemented in</p>
              <ul aria-label="Implemented in" className="mt-1 flex flex-wrap gap-1.5">
                {node.files.map((f) => <li key={f}><Path>{f}</Path></li>)}
              </ul>
            </>
          )}
        </section>
        <section aria-label={`${flow.label} flow`} className={CARD}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{flow.label} flow</p>
          <ol className="mt-2 space-y-2 text-sm">
            {flow.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">{i + 1}</span>
                <span><button type="button" onClick={() => setSelected(s.node)} className="font-semibold text-blue-700 hover:underline">{nodeById(s.node).title}</button>: {s.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

export function ArchitecturePage() {
  return (
    <div className="min-h-screen overflow-x-clip px-4 pb-16 pt-8 text-slate-900 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
          <a href="/" className="inline-flex items-center gap-2 text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to CSV Files</a>
          <a href="/generator" className="inline-flex items-center gap-2 text-blue-700 hover:underline"><Wand2 className="h-4 w-4" /> CSV Generator</a>
        </nav>

        <header className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Reclaim Studio · Engineering case study</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Architecture &amp; Tech Stack</h1>
          <p className="mt-3 max-w-3xl text-lg text-slate-700">Building a maintainable CSV processing application with a focused, type-safe technology stack.</p>
        </header>

        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700">{label}</a>
          ))}
        </nav>

        <Section id="overview" eyebrow="1 · Engineering overview" title="What the system does"
          intro="Reclaim Studio takes refrigerant-batch CSVs from partners who each use their own format, and turns them into consistent, validated, comparable results.">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {([
              [FileInput, 'Accepts CSVs from multiple partners', 'Three partner formats with different column names and units.'],
              [Split, 'Normalizes and validates', 'One normalized record per row, checked by shared rules.'],
              [FileCog, 'Runs independent functions', 'Validation, component mass and demo classification.'],
              [FileOutput, 'Preserves original data', 'Results keep every original column and append new ones.'],
              [GitCompare, 'Compares results visually', 'Two to five results in one comparison dashboard.'],
              [Cloud, 'Runs locally or in the cloud', 'Local files by default; configured for optional Vercel deployment.'],
            ] as [LucideIcon, string, string][]).map(([Icon, title, text]) => (
              <li key={title} className={`${CARD} flex gap-3`}>
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
                <span><span className="block font-semibold">{title}</span><span className="text-sm text-slate-600">{text}</span></span>
              </li>
            ))}
          </ul>
          <blockquote className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <p className="flex items-start gap-3 text-lg font-semibold text-slate-900">
              <Scale className="mt-1 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
              Choose the simplest technology that meets the requirements, while keeping the system maintainable and extensible.
            </p>
            <p className="mt-2 pl-8 text-sm text-slate-600">No accounts, database, queues or extra services until a requirement calls for them. Each layer has one job, so it can be replaced without touching the others.</p>
          </blockquote>
        </Section>

        <Section id="stack" eyebrow="2 · Technology stack" title="Each tool, and why it is here"
          intro="Every entry is a dependency the code actually uses. Each card names the trade-off accepted with it.">
          <ul aria-label="Technology stack" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {TECH.map((t) => (
              <li key={t.name} className={`${CARD} flex flex-col`}>
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-blue-50 p-2"><t.icon className="h-5 w-5 text-blue-600" aria-hidden /></span>
                  <div className="min-w-0">
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="text-sm text-slate-500">{t.role}</p>
                  </div>
                </div>
                <ul className="mt-3 flex-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {t.why.map((w) => <li key={w}>{w}</li>)}
                </ul>
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><span className="font-semibold">Trade-off: </span>{t.tradeoff}</p>
                <p className="mt-3 flex flex-wrap gap-1.5">{t.files.map((f) => <Path key={f}>{f}</Path>)}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="architecture" eyebrow="3 · Architecture" title="How a request moves through the system"
          intro="Choose a request to see the path it takes, then select any component to see what it does and where it lives in the repository.">
          <ArchitectureDiagram />
        </Section>

        <Section id="decisions" eyebrow="4 · Why I chose this architecture" title="The main decisions">
          <div className="grid gap-4 lg:grid-cols-2">
            {DECISIONS.map((d) => (
              <article key={d.question} className={CARD}>
                <h3 className="text-lg font-semibold">{d.question}</h3>
                <div className="mt-2 space-y-2 text-sm text-slate-700">{d.answer.map((p) => <p key={p}>{p}</p>)}</div>
              </article>
            ))}
          </div>
        </Section>

        <Section id="storage" eyebrow="5 · Storage and deployment" title="Hosting and storage are separate decisions"
          intro="Processing never touches persistence directly. Routes talk to one storage interface, and the backend behind it is chosen at startup, so where the app is hosted does not dictate how its files are stored.">
          <div className="grid gap-4 md:grid-cols-2">
            <article className={CARD}>
              <h3 className="flex items-center gap-2 text-lg font-semibold"><HardDrive className="h-5 w-5 text-blue-600" aria-hidden /> Local development</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>The Fastify server runs on Node.js on your machine; Vite proxies <Path>/api</Path> to it.</li>
                <li>Uploaded and processed CSVs are saved as files under <Path>server/data/files</Path>.</li>
                <li>Metadata for every file is kept in one local <Path>meta.json</Path>.</li>
              </ul>
            </article>
            <article className={CARD}>
              <h3 className="flex items-center gap-2 text-lg font-semibold"><Cloud className="h-5 w-5 text-blue-600" aria-hidden /> Optional Vercel deployment</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>The repository is configured to host the frontend and the Fastify API as two Vercel services.</li>
                <li>CSVs and metadata are stored as private Vercel Blob objects, one per file.</li>
                <li>Storage persists independently of any single server instance; without a Blob token the server refuses to start.</li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">Configured, not yet deployed: no Vercel project or Blob store has been created.</p>
            </article>
          </div>

          <div className={`${CARD} mt-4`}>
            <h3 className="font-semibold">The storage abstraction</h3>
            <div className="mt-4 flex flex-col items-center" role="img"
              aria-label="Routes and processing call one storage interface, which is backed by the local filesystem or Vercel Blob; S3 or Cloudflare R2 could be added as another backend.">
              <div className="w-full max-w-md rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                <p className="font-semibold">Routes and processing</p>
                <p className="text-xs text-slate-500">never read or write files themselves</p>
              </div>
              <ArrowDown className="my-2 h-5 w-5 text-slate-400" aria-hidden />
              <div className="w-full max-w-md rounded-xl border-2 border-blue-500 bg-blue-50 px-4 py-3 text-center">
                <p className="font-semibold text-blue-800">storage</p>
                <p className="font-mono text-xs text-blue-800">list · get · read · patch · create · put</p>
              </div>
              <svg viewBox="0 0 300 40" className="h-10 w-full max-w-2xl" aria-hidden preserveAspectRatio="none">
                <path d="M150 0 V14 M50 14 H250 M50 14 V40 M150 14 V40 M250 14 V40" stroke="#94a3b8" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <HardDrive className="mx-auto h-5 w-5 text-blue-600" aria-hidden />
                  <p className="mt-1 text-sm font-semibold">Local filesystem</p>
                  <p className="text-xs text-green-700">Implemented · default</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <Cloud className="mx-auto h-5 w-5 text-blue-600" aria-hidden />
                  <p className="mt-1 text-sm font-semibold">Vercel Blob</p>
                  <p className="text-xs text-green-700">Implemented · when a token is set</p>
                </div>
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center">
                  <Boxes className="mx-auto h-5 w-5 text-slate-400" aria-hidden />
                  <p className="mt-1 text-sm font-semibold text-slate-600">S3 / Cloudflare R2</p>
                  <p className="text-xs text-slate-500">Possible future backend · not built</p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              The app is not tied to Vercel. Hosting elsewhere would mean adding one more backend with the same operations in{' '}
              <Path>server/src/lib</Path> and choosing it at startup; routes, validation and processing would not change.
            </p>
          </div>
        </Section>

        <Section id="tradeoffs" eyebrow="6 · Trade-offs" title="What each decision buys, and what it costs">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table aria-label="Trade-offs" className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left [&>th]:px-4 [&>th]:py-3 [&>th]:font-semibold">
                  <th>Decision</th><th>Benefit</th><th>Trade-off</th>
                </tr>
              </thead>
              <tbody>
                {TRADEOFFS.map(([decision, benefit, cost]) => (
                  <tr key={decision} className="border-t border-slate-100 align-top [&>td]:px-4 [&>td]:py-3">
                    <td className="font-semibold">{decision}</td>
                    <td className="text-slate-700">{benefit}</td>
                    <td className="text-slate-700">{cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="evolve" eyebrow="7 · Evolution" title="What I would evolve as the product scales"
          intro="None of these is needed for the current scope. Each is a response to a specific kind of growth.">
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {EVOLVE.map((e) => (
              <li key={e.title} className={CARD}>
                <h3 className="flex items-center gap-2 font-semibold"><e.icon className="h-5 w-5 text-blue-600" aria-hidden />{e.title}</h3>
                <p className="mt-2 text-sm text-slate-700">{e.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 flex items-center gap-2 text-sm text-slate-500">
            <FlaskConical className="h-4 w-4" aria-hidden /> Every repository path and package named on this page is checked by an automated test.
          </p>
        </Section>
      </div>
    </div>
  );
}
