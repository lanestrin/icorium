# Reclaim Studio - Project Overview

<!-- blueprint:source-hash bcc80bb2dc0c222a14f6cc70be7dccf6d75533c7665fb39f1eca68e147bc1ed3 -->

> Upload partner refrigerant CSVs, run one of three processing functions on every row, export results that keep every original column, and compare 2 to 5 results in charts. Icorium interview exercise; all data fictional, classification rules demo-only.

## Problem

Refrigerant-batch data arrives from different partners with different headers and
units. The exercise asks for one straightforward app that loads a CSV, processes
every row with a chosen function, saves a new CSV keeping all original columns plus
generated ones, and visually compares saved results. It must support a repeatable
in-person demo and an explanation of the engineering decisions. It is not a
production chemical-engineering system.

## Users

- **Non-technical user** - completes the whole workflow in the UI with normal file
  selectors and no code edits.
- **Icorium interviewers** - watch the demo and judge maintainability, frontend,
  backend logic, file handling and visualization.

No accounts or access tiers.

## Usage model

- One local user running a demo; no multi-tenancy.
- Uploaded CSVs are untrusted input: validate type, schema and rows; report clear
  errors. Files are stored under generated IDs; upload names never reach a path.
- Non-requirements: accounts, database (PostgreSQL, Convex), queues, microservices,
  notifications, AI features, an analytics dashboard, inferring purity or
  separation recovery from blend composition.

## Features

Build order from `build-plan.md`. Former phases 1-7 are the shipped baseline:
scaffold, two-column workspace, upload and preview, the three processors, CSV
export, two-file comparison, and tests.

**Shipped**

- **7.1** Interview readiness - final docs and verification review.
- **8.1** Shared row validation - same rules for all functions; `processing_status` and `validation_errors` end every result.
- **8.2** Needs Review status - invalid inputs marked and filterable.
- **8.3** Data Quality Warning - confirm before Mass or Classification on inputs with invalid rows.
- **8.4** Partial processing demo - README and walkthrough updated.
- **9.1** Remove invalid-row tags from the table.
- **9.2** Batch archive and restore via `POST /api/files/archive`.
- **9.3** Active Files / Archived tabs, selection bar, toast with Undo, ⋯ menu.
- **9.4a** Multi-file compare API, `GET /api/compare?ids=a,b,c` (2-5 files).
- **9.4b** Compare workspace opened from the selection bar; footer removed.
- **9.5** Comparison dashboard (**headline**: chips, reference, metric, row chart, summary, top differences, row differences).
- **9.6** CSV generator page `/generator` with `POST /api/generate`.
- **9.7** Processing function column, filter card, Sort by.
- **9.8** Architecture & Tech Stack page `/architecture`.
- **10.1** ASCII + RFC 5987 download file names.
- **10.2** Read-only file list; reconciliation at startup.
- **10.3** Ignore stale client responses.
- **11.1** File IDs identify files.
- **11.2** `file_id` / `result_id` columns carry IDs in the data.
- **11.3** Server requires `replace: true` before overwriting a result (409 otherwise).
- **11.3a** Atomic result create: simultaneous first runs conflict instead of overwriting.
- **11.4** **Replace existing result?** confirmation dialog.
- **11.5** File ID and Filename columns, search and sort by ID, IDs in preview, chips and processing panel, **Imported** marker.
- **11.7** Imported results linked only on a matching source File ID and matching original data; otherwise `importedFrom` provenance, unlinked.
- **11.6** File identity regression tests (API, Blob storage, component), all keyed by full ID.
- **9.9** Compact file table: no Rows or Columns columns; counts in the Preview header.
- **10.4** Collision-proof comparison row keys with display labels, numeric "rows differing", generator attempt cap, focus trap skips disabled fields.

**Next (in order)**

1. **9.10** Row actions menu (`feature/9.10-row-actions-menu`) - Active Files rows use the Archived tab's ⋯ menu (Preview file, Download file) instead of Preview and download buttons. Presentation only. **Next item.**
2. **10.5** Remove or finish dead and partial code (P2).
3. **10.6** Single source for names and limits (P2).
4. **10.7** Partner adapters own `id` and number formats; drop `DIGITS` (P2).
5. **10.8** Client structure: logic at the right level (P2).
6. **10.9** Tighter storage interface (P2).
7. **10.10** Cache parsed rows and problems per file (P2).
8. **10.11** Faster Blob lookups - only if the Vercel deployment goes ahead (P2).
9. **10.12** Configurable server settings (P2).

## Data model

No database. Each file is stored as CSV text plus metadata, through
`server/src/lib/storage.ts` only.

### FileMeta (`shared/types.ts`)

- `id` (string) - File ID. Input: six digits from `100001`, never reused. Result: input ID + `-V` / `-M` / `-C`. Uppercase; anything else is unknown (404).
- `name` (string) - label only; results named `result_<input>_<function>.csv`.
- `rows`, `columns` (number)
- `uploadedAt` (ISO string)
- `status` - `Ready` | `Needs Review` (inputs) | `Processed` (results). UI also shows transient Processing and Error.
- `processor?` (`validation` | `mass` | `classification`) - results only.
- `sourceId?` (string) - the input a result came from.
- `generatedColumns?` (string[]) - columns appended by the processor.
- `problemRows?` (number) - rows failing Composition Validation.
- `archived?` (boolean), `archivedAt?` (ISO string) - hidden from processing and comparison until restored.
- `imported?` (boolean) - an uploaded result (new base ID + code).
- `importedFrom?` (string) - the source File ID embedded in an imported result, kept as provenance whether or not it links (11.7).
- Linked import (11.7): `sourceId` is set only when that source names an original input in the workspace and the original columns and values match; otherwise unlinked.

### CSV contents

- **Input:** partner's original columns + `file_id` on every row (stored copies only; `sample-data/` never changes).
- **Result:** every original column and value (including `file_id`), then `result_id` first among generated columns, then function columns, ending with `processing_status` (`Valid` / `Invalid`) and `validation_errors`. Invalid rows stay with empty calculated values (`Needs review` for classification).
- **Normalized batch** (derived per row, never stored): `batch_id`, `sample_date`, `feed_mass_kg`, `r32_pct`, `r125_pct`, `r134a_pct`, `source_company`. Composition total allowed within ±0.5 pp of 100%.

> Locked (build plan "Non-negotiable identity contract"): File ID format and
> codes, the ID columns, and the append-only result contract. File ID, filename
> and function are separate fields; the filename is display metadata only, never
> used for lookup, linking, collisions, replacement or compare eligibility.
> Duplicate names and contents are allowed; each original upload gets a fresh base
> ID. Uploads overwrite existing `file_id` / `result_id` with new IDs. "Never
> reused" holds only within one persistent workspace: a demo reset (delete
> `server/data/`) restarts allocation. Older stored data is not migrated.
> Imported-result lineage (decided 2026-11-11): linked only on a matching source
> ID and matching original data, otherwise provenance kept, unlinked (11.7).
> Renaming is not supported.

### Comparison (`GET /api/compare?ids=...`)

2-5 results of one function. Rows match by batch ID when every pair of files
shares one, otherwise by position. Returns `files`, `rowMatch`, matched `rows`,
and per column a per-file `summary` (total for kg, mean otherwise), `categories`
and `values[row][file]`. `result_id` is never compared.

### API

| Route | Purpose |
| --- | --- |
| `GET /api/files` | List metadata (read-only) |
| `POST /api/files` | Upload a CSV (multipart) |
| `GET /api/files/:id/rows` | Paged rows + problems |
| `GET /api/files/:id/download` | Download CSV |
| `POST /api/files/archive` | Archive or restore `ids` |
| `POST /api/process` | Run a function; 409 with `ReplaceConflict` unless `replace: true` |
| `POST /api/generate` | Synthetic partner CSVs; saves nothing |
| `GET /api/compare` | Compare 2-5 results |

## Tech stack

- **React 19 + TypeScript + Vite** - client UI
- **Tailwind CSS 4 + Lucide React** - styling and icons
- **Recharts** - comparison charts
- **Node.js 24 + Fastify 5** (run with tsx) - API and uploads
- **Papa Parse** - CSV parse and export
- **Zod** - request and record validation
- **Vitest + React Testing Library** - server unit/API and client component tests
- **Local files; private Vercel Blob when deployed** - storage
- **npm workspaces + GitHub Actions** - `npm run verify` on pushes to `main` and PRs

## Monetization

Not applicable: interview exercise.

## UI/UX

Apple-inspired simplicity from `blueprint/reference-ui.png`: light neutral
background, restrained blue/green accents, generous whitespace, modest borders and
shadows. Works at phone width with no sideways scroll.

- `/` - two columns: upload, function choice and **Run Processing** on the left; CSV file workspace on the right (filter card, Active / Archived tabs, Sort by, selection bar with Archive / Restore / Compare N files). Preview, results, Data Quality Warning and the full-screen comparison dashboard open as modals.
- `/generator` - make 1-10 synthetic partner CSVs and add them to the workspace.
- `/architecture` - stack, decisions, interactive diagram, trade-offs.

## Deployment

- **Primary:** local demo. `npm install`, `npm run dev` (API :3001, UI :5173).
  Five samples seed as `100001`-`100005` on first start.
- **Optional Vercel** (approved 2026-11-06, configured, not deployed): `vercel.json`
  services `client` (Vite, `dist`) and `server` (Fastify, `src/index.ts`, includes
  `sample-data/*.csv`); `/api/*` rewrites to the server. Private Blob storage via
  `BLOB_READ_WRITE_TOKEN`, optional `RECLAIM_BLOB_PREFIX`. Details and outstanding
  checks in `blueprint/vercel-deployment.md`. Further cloud additions need a new decision.

## Open questions

> Resolve in the plans, then re-run /overview.

- **Frozen UI scope vs shipped UI.** Section 2 lists separate File ID / Filename
  columns (built in 11.5) and describes a comparison workspace with tabs, a
  "filterable row matrix" and less repetition, unlike the shipped 9.5 dashboard,
  with no item for the change.
- **Docs say IDs are never reused** (CLAUDE.md, README); the plan limits this to a
  persistent workspace.
- **Plan formatting.** Escaped table pipes (`\|`), escaped `\<`, blank lines that
  split wrapped paragraphs, and `**---**` render incorrectly; the repo layout block
  omits the generator and architecture pages.
