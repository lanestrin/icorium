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
| Language | TypeScript | Type safety across the UI, the shared file service and the tests |
| Frontend tooling | Vite | Local development and frontend builds |
| Styling | SCSS Modules (Sass) on design tokens, Radix for the dialog and row menu, Storybook for the `ui/` components | Responsive, clean Apple-inspired visual styling |
| Icons | Lucide React | Consistent interface icons |
| CSV parsing / export | Papa Parse | Parse CSV data and serialize exported results |
| Validation | Zod | Validate file-action inputs and normalized records |
| Charting | Recharts | Visualize differences between 2 to 5 result files |
| Testing | Vitest | Unit tests for adapters, validation, processing, and export logic (Node, in `tests/`), and client component tests |
| Storage | The browser's IndexedDB (memory when it is blocked) | Keep original/processed CSVs for the demo, on the person's device |
| File conversion (browser) | SheetJS (`xlsx`, from cdn.sheetjs.com), `pdfjs-dist`, `tesseract.js` | Read partner Excel files, text PDFs, and scanned PDFs or images (OCR) into a reviewed CSV before upload |

All free and open source. Expected local software cost: $0.

## Architecture

```text
React + TypeScript UI (in the browser)
        |
        v
Shared file service (shared/, run in the browser)
        |
        +-- CSV import / parsing
        +-- Company-specific normalization adapters
        +-- Validation (Zod + business rules)
        +-- Three independent processing functions
        +-- CSV result export (original + generated columns)
        +-- Comparison calculations for 2–5 result CSVs
        |
        v
Browser storage: IndexedDB (original files and result files)
```

A database is **not required** by the assignment. Keep processing logic independent of storage so persistence can be changed later.

## Agreed UI Scope

Reference image: `blueprint/reference-ui.png`.

- **Main window:** two-column layout with upload and processing controls on the left and a searchable CSV file list on the right.
- **File list:** filename, row/column counts, date, processing function (Original, or the function that made a result), status, Preview, and Download. One filter card holds search by file name, date range, processing function (All / Original / Validation / Mass Calculation / Classification), status (All / Ready / Needs Review / Processing / Processed / Error) and **Clear filters**. **Sort by** (Uploaded newest/oldest, Name A–Z/Z–A, and Archived newest in the Archived tab) sits at the right of the tabs. **Active Files** / **Archived** tabs with counts; a selection bar (**Archive N files**, or **Restore N files** in the Archived tab) appears while rows are selected, a toast with **Undo** confirms it, and archived rows have a ⋯ menu (Preview, Download, Restore).
- **File selection:** click a row to select the input for processing; highlight the active row.
- **Processing status:** inputs are Ready (clean) or Needs Review (has invalid rows). They show Processing (spinner) while running and Error if the request fails; each run adds a Processed result. Mass and Classification ask for confirmation (Data Quality Warning) before running on Needs Review inputs.
- **Preview modal:** show input data without expanding a potentially large CSV inside the main window.
- **Result preview modal:** show original columns plus generated result columns after processing.
- **Compare from the selection bar:** ticking 2–5 results of one function shows **Compare N files**; otherwise the bar says why it can't run. There is no compare footer (removed in 9.4b).
- **Comparison dashboard:** a full-screen dialog with selected-file chips, one control row (reference file, metric, Overview / Row differences), a row chart with one line per file beside **Summary by file** (Δ vs reference, flagged rows), and **Comparison at a glance** with **Top differences**. **Row differences** lists differing rows with highlighted cells. Do not keep the graph permanently on the main screen.

## Synthetic Data for the Demo

Five CSVs represent three fictional refrigerant-data partners with different headers and measurement units. They include incoming-batch mass and R-32, R-125, and R-134a composition, with intentional validation problems.

Processing functions:

1. **Composition Validation** — flag missing, invalid, or inconsistent batch composition values.
2. **Component Mass Calculation** — calculate kilograms of each refrigerant from total feed mass and composition.
3. **Batch Classification** — categorize the blend using explicitly labeled *demo-only* rules.

Base CSV parsing and schema checks run on upload regardless of the processing function. These functions are examples chosen for the exercise, not specified by Icorium.

## Keep the Implementation Simple

**Include:** normal file selection, CSV validation, modular processing functions, error handling, CSV export, comparison graph, and tests.

**Do not add:** user accounts, cloud infrastructure, PostgreSQL, Convex, notifications, AI features, microservices, queues, or an analytics dashboard.

**Approved exception:** an optional Vercel deployment (PR #6, confirmed by the person on 2026-11-06; see `blueprint/vercel-deployment.md`). Since 2026-11-17 (build-plan 16.3) it serves one static site and nothing else. **Withdrawn 2026-11-17:** the private Vercel Blob storage and the server service this exception also allowed, removed by 16.3 at the person's request after the Blob store reached the Hobby plan's usage limit; files now stay in each person's browser. Any further cloud addition needs a new decision.

**Approved exception:** browser-side file conversion with SheetJS (`xlsx`), `pdfjs-dist` and `tesseract.js`, so partners' Excel files, text PDFs and scanned PDFs or images can be imported (build-plan 9.14, confirmed by the person on 2026-11-13). SheetJS `xlsx` 0.20.3 is installed from the official cdn.sheetjs.com tarball for Excel (9.14a), and `pdfjs-dist` for text PDFs (9.14b); `tesseract.js` 7 (with `wasm-feature-detect`, its own dependency, to choose the core build) reads scanned pages and images (9.14c). Its worker script and WebAssembly core are served by this site, not a CDN. Conversion runs in the browser; the file service stays CSV-only. No account, server-side service or AI service is involved: OCR runs locally, and only Tesseract's language data is downloaded from a CDN.

**Approved change:** styling moves from Tailwind CSS to SCSS Modules with central design tokens, a shared `ui/` component library documented in Storybook, and Radix primitives (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`) for the dialog and row menu (build-plan M13, confirmed by the person on 2026-11-14). Tailwind was removed in 13.7; all styling uses SCSS Modules and the tokens.

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
| Load two saved result CSVs and compare them | `api.test.ts` renamed re-upload and compare; `App.test.tsx` selection-bar Compare and workspace |
| A graph that makes differences apparent | `core.test.ts`/`api.test.ts` comparison data; `App.test.tsx` modal summary. Chart drawing not verified in a browser |
| Clear errors for invalid input and incompatible comparisons | `api.test.ts` schema and comparison errors; `App.test.tsx` upload and comparison failures |
| Explain adding a new function or CSV schema | README **Extending** |
