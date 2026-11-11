# Project Plan

> Seeded by `/adopt` on 2026-11-11 from `CLAUDE.md`, `README.md`,
> `blueprint/stack.md` and `blueprint/build-plan.md`. Those documents keep the
> full detail; this plan is the summary `/overview` distills. Edit freely.

## 1. Problem - What problem are we solving?

Icorium's full-stack coding exercise: show, in one straightforward application,
a complete CSV workflow for refrigerant-batch data that arrives from different
partners in different column names and units. A user loads a CSV, runs one of
three processing functions on every row, saves a new CSV that keeps every
original column plus the generated ones, and compares saved results visually.

This is an interview exercise illustrated with synthetic data, not a production
chemical-engineering system. All data is fictional; classification rules are
demo-only. The app must also support a repeatable in-person demo and let the
person explain the engineering decisions.

## 2. Users - Who is this for?

- A non-technical user who completes the whole workflow through the UI, with
  normal file selectors and no code edits.
- The Icorium interviewers, who watch the demo and review the code for
  maintainability, frontend, backend logic, file handling and visualization.

## 3. Features - What does the MVP need?

All MVP capabilities are shipped (see `build-plan.md`):

- Upload CSVs and preview their rows (paged); schema detection per partner
- Three processing functions on every row: Composition Validation, Component
  Mass Calculation, Batch Classification (demo-only rules)
- Shared row validation: invalid rows are kept with reasons, inputs show
  Ready / Needs Review, and a Data Quality Warning precedes Mass and
  Classification on inputs with invalid rows
- Result CSV export keeping every original column plus generated columns
- File workspace: filters, sort, Active / Archived tabs, batch archive and
  restore with Undo
- Compare 2 to 5 results of one function in a full-screen dashboard
- File IDs (`100001`, `100001-M`) that identify files and travel in the CSV data;
  re-runs replace a result only with confirmation (server side done, UI dialog next)
- CSV generator page (`/generator`) and an Architecture & Tech Stack page (`/architecture`)

## 4. Data - What are we storing?

- **Files:** uploaded input CSVs and generated result CSVs, stored as CSV text
  with metadata (File ID, name, partner, rows, columns, processor, status,
  problem counts, upload date, `archived` / `archivedAt`).
- **Normalized batch fields** (derived, not stored separately): `batch_id`,
  `sample_date`, `feed_mass_kg`, `r32_pct`, `r125_pct`, `r134a_pct`,
  `source_company`. Original rows are kept apart from normalized fields so
  exports preserve the original values.
- **IDs in the data:** inputs carry a `file_id` column; results add `result_id`
  as their first generated column.
- Five synthetic sample CSVs (three fictional partners) in `sample-data/`,
  seeded as `100001`-`100005` on first start. Never edited.

No database, accounts or user data.

## 5. Tech - What stack are we using?

- **Client:** React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, Lucide React
- **Server:** Node.js 24, Fastify 5 (+ `@fastify/multipart`), Papa Parse, Zod, run with tsx
- **Shared:** `shared/types.ts` for types and the processor list
- **Storage:** local files under `server/data/`; private Vercel Blob when deployed
- **Tests:** Vitest (server unit + API via `app.inject`; client unit/component
  with React Testing Library and jsdom)
- **Tooling:** npm workspaces; GitHub Actions CI running `npm run verify`

## 6. Monetize - How will this make money?

Not applicable: an interview exercise, not a product.

## 7. UI/UX - How should this look and feel?

Modern Apple-inspired simplicity, following `blueprint/reference-ui.png`: light
neutral background, restrained blue/green accents, clear typography, generous
whitespace, modest borders and shadows, no unnecessary dashboard or navigation.
Two-column main screen (controls on the left, CSV file workspace on the right);
preview, results and comparison open in modals. Must work at phone width with no
sideways page scroll. The frozen UI scope is in `build-plan.md` section 2.

## 8. Deployment - Where and how will this ship?

Primary target is a local demo: `npm install`, then `npm run dev` (API :3001,
UI :5173). An optional Vercel deployment (client and server services, private
Blob storage, server-side only) is configured but not deployed; see
`blueprint/vercel-deployment.md` for settings and outstanding checks. Approved
by the person on 2026-11-06; any further cloud addition needs a new decision.

## 9. Usage model and constraints (optional)

- Single local user running a demo; no accounts, no multi-tenancy.
- Uploaded CSVs are untrusted input: validate file type, schema and rows, and
  report clear errors.
- Explicit non-requirements: user accounts, database (PostgreSQL, Convex),
  queues, microservices, notifications, AI features, an analytics dashboard,
  inferring purity or separation recovery from blend composition.
