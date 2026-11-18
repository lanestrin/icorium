# Project Plan

> Written on 2026-11-11 from the project instructions, `README.md`,
> `blueprint/stack.md` and `blueprint/build-plan.md`. Those documents keep the
> full detail; this plan is the summary. Edit freely.

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
  re-runs replace a result only with confirmation
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

- **Client:** React 19, TypeScript, Vite, Sass (SCSS Modules) on design tokens, Radix (dialog and menu), Storybook, Recharts, Lucide React, Papa Parse, Zod
- **Shared:** `shared/` for types, the processor list, processing and the file service, with no Node imports; it runs in the browser
- **Storage:** the browser's IndexedDB (memory when it is blocked); files stay on the person's device
- **No server:** the app is a static site (since build-plan 16.3)
- **Tests:** Vitest (Node tests in `tests/` for shared logic, the file service and
  the release tooling; client unit/component with React Testing Library and jsdom)
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

Primary target is a local demo: `npm install`, then `npm run dev` (the app on
:5173). Vercel serves it as one static site, free and with no server or cloud
storage: the Test site deploys `main`. See `blueprint/vercel-deployment.md`.
Approved by the person on 2026-11-06 and reduced to static hosting in 16.3
(2026-11-17); any further cloud addition needs a new decision.

## 9. Usage model and constraints (optional)

- Single local user running a demo; no accounts, no multi-tenancy.
- Uploaded CSVs are untrusted input: validate file type, schema and rows, and
  report clear errors.
- Explicit non-requirements: user accounts, database (PostgreSQL, Convex),
  queues, microservices, notifications, AI features, an analytics dashboard,
  inferring purity or separation recovery from blend composition.

## 10. Future direction — Proposed, Not Yet Implemented

> **Proposed — Not Yet Implemented.** Nothing in this section is a current
> requirement. Sections 1–9 above and the "Do not add" list in
> `blueprint/stack.md` govern all current work. No part of this direction may
> be built until it is added to `blueprint/build-plan.md` as approved items.

Decided by the person on 2026-11-16: finish the demonstration first (the open
items in `build-plan.md`, ending with 9.15), then evolve Reclaim Studio into a
production engineering analytics platform. Detailed production planning is kept
outside this repository.

The proposed future scope:

- Multi-tenant organizations and user authentication
- Datasets private to the engineer who uploads them by default
- Explicit engineer-to-engineer sharing
- Contractually authorized internal access to partner datasets
- Cross-partner comparisons
- PostgreSQL and object storage
- Background processing workers
- Scalable cloud infrastructure
- Licensing and resource quotas
- Expanded document ingestion and engineering analytics

The demo's browser-based file conversion (build-plan 9.14) keeps its approved
scope; server-side or large-scale ingestion belongs to this future direction and
needs its own approved items.
