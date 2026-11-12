import { useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowRight, Atom, Boxes, Braces, ChartColumn, Check, Cloud, Code2, Database, FileCog, FileSpreadsheet, FileText,
  FlaskConical, Laptop, Layers, Scale, Server, Settings, Shapes, ShieldCheck, TriangleAlert, Upload, User, Users, Wand2, Wind, Workflow, Zap,
  type LucideIcon,
} from 'lucide-react';

/*
 * Architecture & Tech Stack page (/architecture), for walking through the design in an interview.
 * Every repository path and package named here is checked by client/src/architecture-content.test.ts,
 * so the page cannot drift from the code without a failing test.
 */

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
    files: ['client/src/App.tsx', 'client/src/components'],
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
      'Utility classes keep spacing, colour and type consistent without a separate stylesheet per component.',
      'Responsive layouts down to phone width with no extra CSS files.',
      'No large UI component framework to learn, theme or override.',
    ],
    tradeoff: 'Long class lists in the markup; consistency relies on shared patterns rather than a component library.',
    files: ['client/src/index.css'],
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
    files: ['client/src/components/CompareWorkspace.tsx'],
  },
  {
    name: 'Lucide', label: 'Lucide', role: 'Icons', icon: Shapes, packages: [['client', 'lucide-react']],
    why: ['Consistent, lightweight icons; only the icons a file imports are bundled.'],
    tradeoff: 'One more dependency, for icons alone.',
    files: ['client/src/components/FileTable.tsx'],
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
    files: ['server/src/core.test.ts', 'server/src/api.test.ts', 'client/src/App.test.tsx'],
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
const PROCESSING_LOCATION = {
  title: 'Processing location (server vs. browser)',
  text: 'A server-side API parses, normalizes, validates and processes every CSV; the browser only uploads, shows and downloads.',
  benefits: ['Centralized, consistent processing', 'Easier to add business rules and integrations', 'Works across devices with a simple UI'],
  tradeoff: 'Uploads and processing need the API running and reachable. If it is down, or the person is offline, files cannot be processed.',
};

const DECISIONS: { question: string; icon: LucideIcon; summary: string; answer: string[] }[] = [
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

const EVOLVE: { title: string; icon: LucideIcon; text: string }[] = [
  { title: 'Authentication', icon: Users, text: 'User accounts and partner permissions' },
  { title: 'PostgreSQL', icon: Database, text: 'Searchable metadata and audit history' },
  { title: 'Background jobs', icon: Workflow, text: 'Process large files asynchronously' },
  { title: 'Upload hardening', icon: ShieldCheck, text: 'Rate limits, quotas and file safeguards' },
  { title: 'Monitoring', icon: ChartColumn, text: 'Logs, error tracking and alerts' },
];

/** Storage backends in the order they apply: built ones first, then the possible next one. */
const STORAGE_OPTIONS: { name: string; icon: LucideIcon; note: string; built: boolean }[] = [
  { name: 'Local filesystem', icon: Laptop, note: 'Default', built: true },
  { name: 'Vercel Blob', icon: Cloud, note: 'When a token is set', built: true },
  { name: 'S3 / Cloudflare R2', icon: Boxes, note: 'Not built', built: false },
];

/** A short list with a green tick before each item. */
const Checks = ({ label, items }: { label: string; items: ReactNode[] }) => (
  <ul aria-label={label} className="mt-3 space-y-1.5 text-sm text-slate-700">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden /><span>{item}</span></li>
    ))}
  </ul>
);

const SECTIONS = [
  ['overview', 'Overview'], ['stack', 'Tech stack'], ['architecture', 'Architecture'], ['decisions', 'Decisions'],
  ['storage', 'Storage'], ['evolve', 'Evolution'],
] as const;

const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const H2 = 'text-2xl font-bold tracking-tight';
const Path = ({ children }: { children: string }) => (
  <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{children}</code>
);

function Section({ id, eyebrow, title, intro, side, children }: {
  id: string; eyebrow: string; title: string; intro?: string; side?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}
      className={`mt-12 scroll-mt-6 border-t border-slate-200 pt-12 first-of-type:mt-8 first-of-type:border-t-0 first-of-type:pt-0 ${side ? 'xl:grid xl:grid-cols-[16rem_minmax(0,1fr)] xl:items-start xl:gap-8' : ''}`}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">{eyebrow}</p>
        <h2 id={`${id}-title`} className={`${H2} mt-1`}>{title}</h2>
        {intro && <p className="mt-2 max-w-3xl text-slate-600">{intro}</p>}
      </div>
      <div className={side ? 'mt-6 min-w-0 xl:mt-0' : 'mt-6'}>{children}</div>
    </section>
  );
}

/** What the system does, one short card each. */
const OVERVIEW: [LucideIcon, string, string][] = [
  [Upload, 'Import CSVs', 'Three partner formats and units'],
  [Layers, 'Normalize', 'One shared record per row'],
  [ShieldCheck, 'Validate', 'Shared rules; bad rows kept'],
  [FileCog, 'Process', 'Three functions; originals kept'],
  [ChartColumn, 'Compare', '2–5 results side by side'],
  [Cloud, 'Run anywhere', 'Local or cloud storage'],
];

/** One tile per technology; selecting a tile shows why it is here, its trade-off and where it is used. */
function TechStack() {
  const [selected, setSelected] = useState(TECH[0].name);
  const tech = TECH.find((t) => t.name === selected)!;
  return (
    <>
      <div role="group" aria-label="Technology stack" className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
        {TECH.map((t) => (
          <button key={t.name} type="button" aria-pressed={selected === t.name} aria-label={`${t.name}, ${t.role}`} onClick={() => setSelected(t.name)}
            className={`flex min-w-0 flex-col items-center rounded-2xl border px-2 py-3 text-center shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
              ${selected === t.name ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
            <t.icon className="h-6 w-6 text-blue-600" aria-hidden />
            <span className="mt-2 text-sm font-semibold leading-tight">{t.label}</span>
            <span className="mt-0.5 text-xs text-slate-500">{t.role}</span>
          </button>
        ))}
      </div>
      <section aria-label="Selected technology" aria-live="polite" className={`${CARD} mt-4`}>
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-blue-50 p-2"><tech.icon className="h-5 w-5 text-blue-600" aria-hidden /></span>
          <div className="min-w-0">
            <h3 className="font-semibold">{tech.name}</h3>
            <p className="text-sm text-slate-500">{tech.role}</p>
          </div>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {tech.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><span className="font-semibold">Trade-off: </span>{tech.tradeoff}</p>
        <p className="mt-3 flex flex-wrap gap-1.5">{tech.files.map((f) => <Path key={f}>{f}</Path>)}</p>
      </section>
    </>
  );
}

/** Turns a pipeline row's right end down and back to the left start (wide screens only). */
const Turn = () => (
  <li aria-hidden className="relative hidden h-10 md:col-span-4 md:block">
    <div className="absolute inset-y-0 left-[calc((100%-6rem)/8)] right-[calc((100%-6rem)/8)]">
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-full w-full">
        <path d="M100 0 V10 H0 V20" stroke="#60a5fa" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  </li>
);

/** Static diagram: the person, then two rows of four components joined by arrows. */
function ArchitectureDiagram() {
  const [person, ...steps] = PIPELINE;
  const Step = ({ i }: { i: number }) => {
    const p = steps[i];
    const last = i === steps.length - 1;
    return (
      <li className="relative">
        <div className={`flex h-full flex-col items-center justify-center rounded-xl border px-2 py-4 text-center shadow-sm ${last ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
          <p.icon className="h-6 w-6 text-blue-600" aria-hidden />
          <span className="mt-2 font-semibold">{p.title}</span>
          {p.sub && <span className="text-sm text-slate-500">{p.sub}</span>}
        </div>
        {i % 4 !== 3 && <ArrowRight aria-hidden className="absolute -right-6.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-blue-500 md:block" />}
        {!last && <ArrowDown aria-hidden className="mx-auto my-1 h-5 w-5 text-blue-500 md:hidden" />}
      </li>
    );
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <div className={CARD}>
        <ol aria-label="Architecture diagram" className="grid md:grid-cols-4 md:gap-x-8">
          <li className="md:col-span-4">
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 md:w-[calc(50%-1rem)]">
              <person.icon className="h-6 w-6 shrink-0 text-blue-600" aria-hidden />
              <span><span className="block font-semibold">{person.title}</span><span className="text-sm text-slate-600">{person.sub}</span></span>
            </div>
            <ArrowDown aria-hidden className="mx-auto my-1 h-5 w-5 text-blue-500 md:mx-0 md:my-2 md:ml-[calc((100%-6rem)/8-0.625rem)]" />
          </li>
          {[0, 1, 2, 3].map((i) => <Step key={i} i={i} />)}
          <Turn />
          {[4, 5, 6, 7].map((i) => <Step key={i} i={i} />)}
        </ol>
      </div>
      <section aria-labelledby="how-it-works" className={CARD}>
        <h3 id="how-it-works" className="flex items-center gap-3 text-lg font-semibold">
          <span className="rounded-xl bg-blue-50 p-2"><Layers className="h-5 w-5 text-blue-600" aria-hidden /></span> How it works
        </h3>
        <ol className="mt-4 space-y-3 text-sm text-slate-700">
          {HOW_IT_WORKS.map((text, i) => (
            <li key={text} className="flex gap-3">
              <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{i + 1}</span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </section>
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

        <Section id="overview" eyebrow="1 · System overview" title="What the system does" side
          intro="Takes partner CSVs in different formats and turns them into consistent, validated, comparable results.">
          <ul aria-label="What the system does" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {OVERVIEW.map(([Icon, title, text]) => (
              <li key={title} className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm">
                <Icon className="h-7 w-7 text-blue-600" aria-hidden />
                <span className="mt-2 font-semibold">{title}</span>
                <span className="mt-1 text-sm text-slate-600">{text}</span>
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

        <Section id="stack" eyebrow="2 · Technology stack" title="The tools and their purpose" side
          intro="Every tile is a dependency the code actually uses. Select one to see why it is here and the trade-off accepted with it.">
          <TechStack />
        </Section>

        <Section id="architecture" eyebrow="3 · Architecture" title="How data moves through the app">
          <ArchitectureDiagram />
        </Section>

        <Section id="decisions" eyebrow="4 · Design decisions and constraints" title="The main decisions">
          <article aria-label={PROCESSING_LOCATION.title}
            className={`${CARD} grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center`}>
            <div className="flex gap-4">
              <span className="h-fit rounded-2xl bg-blue-50 p-3"><Server className="h-8 w-8 text-blue-600" aria-hidden /></span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">{PROCESSING_LOCATION.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{PROCESSING_LOCATION.text}</p>
              </div>
            </div>
            <div className="lg:border-l lg:border-slate-200 lg:pl-6"><Checks label="Benefits" items={PROCESSING_LOCATION.benefits} /></div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden /> Trade-off: server dependency</p>
              <p className="mt-1 text-sm">{PROCESSING_LOCATION.tradeoff}</p>
            </div>
          </article>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            {DECISIONS.map((d, i) => (
              <article key={d.question} className={`${CARD} flex gap-4 ${i < 3 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
                <span className="h-fit rounded-2xl bg-blue-50 p-3"><d.icon className="h-6 w-6 text-blue-600" aria-hidden /></span>
                <div className="min-w-0">
                  <h3 className="font-semibold">{d.question}</h3>
                  <p className="mt-1 text-sm text-slate-600">{d.summary}</p>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-medium text-blue-700 hover:underline">The full reasoning</summary>
                    <div className="mt-2 space-y-2 text-slate-700">{d.answer.map((p) => <p key={p}>{p}</p>)}</div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section id="storage" eyebrow="5 · Storage and deployment" title="Hosting and storage" side
          intro="Separate concerns, one storage interface. Routes and processing never touch persistence; the backend is chosen at startup.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]">
            <article className={CARD}>
              <h3 className="flex items-center gap-2 font-semibold"><Laptop className="h-5 w-5 text-blue-600" aria-hidden /> Local development</h3>
              <Checks label="Local development" items={[
                'Node.js API with filesystem storage',
                <>Originals, results and metadata under <Path>server/data</Path></>,
              ]} />
            </article>
            <article className={CARD}>
              <h3 className="flex items-center gap-2 font-semibold"><Cloud className="h-5 w-5 text-blue-600" aria-hidden /> Optional Vercel deployment</h3>
              <Checks label="Optional Vercel deployment" items={['Separate frontend and API services', 'Private Vercel Blob storage', 'Configured, not yet deployed']} />
            </article>
            <div className="md:col-span-2 xl:col-span-1">
              <h3 className="text-sm font-semibold">Storage options</h3>
              <div role="img" className="mt-3 flex items-stretch gap-1"
                aria-label="Storage options: the local filesystem (the default) and private Vercel Blob are built; S3 or Cloudflare R2 could be added as another backend behind the same interface.">
                {STORAGE_OPTIONS.map((o, i) => (
                  <div key={o.name} className="flex min-w-0 flex-1 items-center gap-1">
                    {i > 0 && <ArrowRight className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />}
                    <div className={`flex h-full min-w-0 flex-1 flex-col items-center rounded-xl px-2 py-3 text-center ${i === 0 ? 'border border-blue-300 bg-blue-50' : o.built ? 'border border-slate-200 bg-white' : 'border border-dashed border-slate-300 bg-slate-50 text-slate-400'}`}>
                      <o.icon className={`h-5 w-5 ${o.built ? 'text-blue-600' : 'text-slate-400'}`} aria-hidden />
                      <span className={`mt-1 text-xs font-semibold ${o.built ? 'text-slate-800' : ''}`}>{o.name}</span>
                      <span className="text-[11px] text-slate-500">{o.note}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                One interface (list · get · read · patch · create · createAt · put) in <Path>server/src/lib</Path>, so another backend changes nothing else.
              </p>
            </div>
          </div>
        </Section>

        <Section id="evolve" eyebrow="6 · How it can scale" title="Future evolution" side
          intro="Planned enhancements, added only when a requirement calls for them.">
          <ul aria-label="Future evolution" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {EVOLVE.map((e) => (
              <li key={e.title} className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm">
                <e.icon className="h-7 w-7 text-blue-600" aria-hidden />
                <h3 className="mt-2 font-semibold">{e.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{e.text}</p>
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
