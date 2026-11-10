# Reclaim Studio — Recommended Technology Stack

## Project Goal

Build a simple, maintainable full-stack application for the Icorium coding exercise. Users should be able to:

1. Upload and view CSV data.
2. Select one of three processing functions and execute it on every row.
3. View processed results and export a **new CSV** containing all original columns and generated result columns.
4. Load **two previously generated result CSV files** and visualize their differences.
5. Complete the workflow through one interface, without editing code.

This project is an interview exercise, **not** an industrial production system or a simulation of Icorium's proprietary chemistry.

## Recommended Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend | React | User interface, file list, controls, preview and comparison modals |
| Language | TypeScript | Type safety across frontend and backend |
| Frontend tooling | Vite | Local development and frontend builds |
| Styling | Tailwind CSS | Responsive, clean Apple-inspired visual styling |
| Icons | Lucide React | Consistent interface icons |
| Backend runtime | Node.js | Run server-side code |
| Backend framework | Fastify | HTTP API, file uploads and processing endpoints |
| CSV parsing / export | Papa Parse | Parse CSV data and serialize exported results |
| Validation | Zod | Validate API inputs and normalized records |
| Charting | Recharts | Visualize differences between two result files |
| Testing | Vitest | Unit tests for adapters, validation, processing, and export logic |
| Storage | Local files; private Vercel Blob when deployed | Keep original/processed CSVs for the demo |

All free and open source. Expected local software cost: $0.

## Architecture

```text
React + TypeScript UI
        |
        v
Node.js + Fastify API
        |
        +-- CSV import / parsing
        +-- Company-specific normalization adapters
        +-- Validation (Zod + business rules)
        +-- Three independent processing functions
        +-- CSV result export (original + generated columns)
        +-- Comparison calculations for two result CSVs
        |
        v
Local file storage (original files and result files)
```

A database is **not required** by the assignment. Keep processing logic independent of storage so persistence can be changed later.

## Agreed UI Scope

Reference image: `blueprint/reference-ui.png`.

- **Main window:** two-column layout with upload and processing controls on the left and a searchable CSV file list on the right.
- **File list:** filename, row/column counts, date, status, Preview, and Download. Search, date-range and status filters (All / Ready / Needs Review / Processing / Processed / Error). **Active Files** / **Archived** tabs with counts; a selection bar (**Archive N files**, or **Restore N files** in the Archived tab) appears while rows are selected, a toast with **Undo** confirms it, and archived rows have a ⋯ menu (Preview, Download, Restore).
- **File selection:** click a row to select the input for processing; highlight the active row.
- **Processing status:** inputs are Ready (clean) or Needs Review (has invalid rows). They show Processing (spinner) while running and Error if the request fails; each run adds a Processed result. Mass and Classification ask for confirmation (Data Quality Warning) before running on Needs Review inputs.
- **Preview modal:** show input data without expanding a potentially large CSV inside the main window.
- **Result preview modal:** show original columns plus generated result columns after processing.
- **Fixed compare footer:** select File A and File B from dropdowns; enable Compare Selected for two different, compatible result CSVs. On mobile it collapses to the icon and title and slides up when tapped.
- **Comparison modal:** graph and summary table. Do not keep the graph permanently on the main screen.

## Synthetic Data for the Demo

Five CSVs represent three fictional refrigerant-data partners with different headers and measurement units. They include incoming-batch mass and R-32, R-125, and R-134a composition, with intentional validation problems.

Processing functions:

1. **Composition Validation** — flag missing, invalid, or inconsistent batch composition values.
2. **Component Mass Calculation** — calculate kilograms of each refrigerant from total feed mass and composition.
3. **Batch Classification** — categorize the blend using explicitly labeled *demo-only* rules.

Base CSV parsing and schema checks run on upload regardless of the processing function. These functions are examples chosen for the exercise, not specified by Icorium.

## Keep the Implementation Simple

**Include:** normal file selection, CSV validation, modular backend functions, error handling, CSV export, comparison graph, and tests.

**Do not add:** user accounts, cloud infrastructure, PostgreSQL, Convex, notifications, AI features, microservices, queues, or an analytics dashboard.

**Approved exception:** an optional Vercel deployment with private Blob storage (PR #6, confirmed by the person on 2026-11-06; see `blueprint/vercel-deployment.md`). It is server-side only and needs no accounts. Local development still uses local files and no cloud service. Any further cloud addition needs a new decision.

## Acceptance evidence

These product checks are covered by automated tests (`npm run verify`), not a
manual checklist. Real-browser layout and chart drawing are not verified by them.

| Check | Evidence |
| --- | --- |
| Upload a CSV through the normal file chooser | `App.test.tsx` upload tests; `api.test.ts` loading files |
| View input rows in the preview modal | `App.test.tsx` preview paging and errors; `api.test.ts` preview paging |
| Select one of three functions and process **all** rows | `App.test.tsx` processor choice and batches; `api.test.ts` all functions × all samples |
| View results in the application | `App.test.tsx` result preview after processing |
| Export a new CSV keeping **every original column** plus generated columns | `api.test.ts` current result contract (headers, values, download) |
| Load two saved result CSVs and compare them | `api.test.ts` renamed re-upload and compare; `App.test.tsx` compare footer and modal |
| A graph that makes differences apparent | `core.test.ts`/`api.test.ts` comparison data; `App.test.tsx` modal summary. Chart drawing not verified in a browser |
| Clear errors for invalid input and incompatible comparisons | `api.test.ts` schema and comparison errors; `App.test.tsx` upload and comparison failures |
| Explain adding a new function or CSV schema | README **Extending** |
