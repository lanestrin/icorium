# Reclaim Studio

[![CI](https://github.com/lanestrin/icorium/actions/workflows/ci.yml/badge.svg)](https://github.com/lanestrin/icorium/actions/workflows/ci.yml)

Upload partner refrigerant CSVs, run one of three processing functions on every row, export results (original columns + generated columns), and compare 2 to 5 result files.

Interview exercise. All data is fictional and the classification rules are demo-only.

## Run

Requires Node.js 24 (the version CI uses).

```bash
npm install
npm run dev       # API on :3001, UI on http://localhost:5173 (Vite picks the next free port if 5173 is taken)
npm run verify    # every test + the production build
```

The five synthetic sample CSVs in `sample-data/` (described in `sample-data/README.txt`) are loaded the first time the server starts. To reset the demo, stop the servers, delete `server/data/` and start again.

## Tests

| Level | File | What it proves |
| --- | --- | --- |
| Unit (Vitest) | `server/src/core.test.ts` | Unit conversions, validation rules and tolerance, mass maths, classification thresholds, CSV escaping, comparison maths and row matching for 2–5 files, and the CSV generator (formats, exact error counts and reasons, file names, distinct files in a batch, seeds, limits) |
| API (Vitest + `app.inject`) | `server/src/api.test.ts` | Every endpoint and error message, including archive and restore and CSV generation; all three functions on all five samples: exact invalid rows and reasons, every original column and value kept, download, renamed re-upload and compare |
| Unit + API (Vitest, Blob SDK mocked in memory) | `server/src/blob-storage.test.ts` | The private Blob storage adapter: shared files across instances, atomic result replacement, idempotent sample seeding, conflict and failure handling, and refusing a Vercel start without storage configured |
| Unit (Vitest) | `client/src/compare-view.test.ts` | When a selection can be compared, short file labels, metric names, Δ vs reference, number formats, top-difference ranking and the fitted chart axis |
| Component (Vitest + React Testing Library) | `client/src/GeneratorPage.test.tsx` | Generator defaults, partner/rows/files/error choices, the file list, per-file preview and planted errors, download names, adding all files to CSV Files and partial failure, generate failure, double clicks, keyboard submit, and `/generator` routing |
| Unit (Vitest) | `client/src/file-status.test.ts` | Input eligibility, status precedence, when the Data Quality Warning appears and its per-file counts |
| Component (Vitest + React Testing Library) | `client/src/App.test.tsx` | Upload success and failure; selection and status/search/date filters; archive tabs, selection bar, undo toast and the archived-row menu, including failures, double clicks and keyboard use; processing locks, failure and retry; warning dialog counts, cancel/confirm, focus and duplicate clicks; preview paging and errors; selection-bar Compare and its reasons, the comparison dashboard (file chips, metric and view switches, summary by file with Δ vs reference, at-a-glance figures, top differences, row differences, deviation view, keyboard close) and comparison errors |

`npm test` runs server unit/API tests and client unit/component tests. Client tests use Vitest, React Testing Library and jsdom; API calls are mocked at the client boundary while server behavior has separate API coverage. `npm run verify` also type-checks and builds the client. These replace required manual acceptance checks; they do not establish real-browser layout or visual correctness. Run `npm test -w client` for client tests only.

## File status and selection

Input files without invalid rows are **Ready**; inputs with invalid rows are **Needs Review** and remain selectable for all three functions. The status filter includes both states. Results remain **Processed**; open **Preview** to see which rows are invalid and why. Existing saved file metadata is updated automatically without rewriting CSVs or resetting data.

Every row, input or result, can be selected. **Run Processing** uses only the selected inputs, and the processing panel lists every selected input filename, including selections hidden by filters. Filters do not clear selections; select-all affects the visible rows. Processing a file does not repair its source data, so an invalid input remains Needs Review after a successful run.

The list has two tabs, **Active Files** and **Archived**, each showing its file count. Selecting rows shows a bar at the top of the table with the count, **Clear selection** and **Archive N files**. A toast confirms the change and offers **Undo** for a few seconds. The **Archived** tab notes that archived files are excluded from processing and comparison, lists them most recently archived first with **Archived On** and **Original Upload** dates, and offers **Restore N files** in the selection bar. Each archived row has a ⋯ menu with **Preview file**, **Download file** and **Restore file**. Restored files keep their status. Search, date and status filters apply within the current tab. Archiving only sets a flag: no CSV is moved or deleted, and archived files can still be previewed and downloaded. Archived files are left out of processing and the compare dropdowns. Re-running a function on an input replaces its result as before, so an archived result comes back as a new, unarchived one.

## CSV generator

Open **CSV Generator** (top right of the file list), or go to `/generator`, to make more synthetic partner CSVs. Choose **Partner A, B or C**, the number of **Rows** per file (1–5,000), the **Number of files** (1–10), and **No errors** or **Include errors** with the number of **Rows with errors** per file. **Generate** lists the files; **Preview** shows a file's planted errors and first 10 rows. **Download** saves a file through the browser (to its usual download folder), and **Add to CSV Files** uploads them all like any other file.

Files are named `partnerA-MMDDYYYY-001.csv`, `-002` and so on: the partner, the day they were made and their number in the batch (e.g. `partnerA-11092026-001.csv`). Numbering restarts at 001 for each batch, and names can be edited before downloading or adding. No two files in a batch have the same data: each gets its own random seed, and a file that matched another would be regenerated.

Generated files use the partner's own columns and units, the same as the samples: A in kilograms and percentages, B in pounds and percentages, C in grams and fractions. Batch IDs run from `A-001` (wider for over 999 rows) and dates from 2026-09-01, so a generated file shares batch IDs with that partner's samples. Clean rows always pass Composition Validation. With errors, exactly the requested number of rows in each file fail it, each with one of: missing mass, non-numeric mass, a negative R-125 percentage, a composition total 15 points short, a missing batch ID, or a duplicate batch ID (which always marks two rows). Nothing is saved until you add the file.

## Demo steps

1. Open **Preview** on `partner_a_baseline.csv` to show its original columns. It is **Needs Review**; Preview lists and highlights row 8 (`mass missing`).
2. Click the row to select it, choose **Component Mass Calculation**, and click **Run Processing**. A **Data Quality Warning** lists the file with *24 valid rows · 1 invalid row* and explains that valid rows will be calculated, while invalid rows stay in the output with error details and no calculated values. Click **Process Valid Rows**. The row shows *Processing…*, then the result preview opens with the new columns highlighted. (**Cancel** sends nothing and keeps the selection.)
3. **Download** the result and open it: every original column is unchanged, and `r32_mass_kg`, `r125_mass_kg`, `r134a_mass_kg`, `processing_status` and `validation_errors` are added at the end. Row 8 is `Invalid` with `mass missing` and blank masses; every other row is `Valid` with an empty `validation_errors`.
4. Check both Partner A files and run **Component Mass Calculation** once. The warning lists both files with their counts; after **Process Valid Rows** they are processed in turn, and the two new results are selected in the list. (Running each file on its own works too.)
5. Click **Compare 2 files** in the selection bar. The comparison dashboard lists the selected files as chips (*Partner A · Baseline*, *Partner A · Followup*) with a tick or warning for flagged rows, and says rows are matched by batch ID. Choose the **R32 mass (kg)** metric: the row chart draws one line per file on an axis fitted to the data (A-008 has no baseline value, A-013 no follow-up value), **Summary by file** gives each total, its Δ against the **Reference file** and flagged rows, and **Comparison at a glance** and **Top differences** name the rows that differ most. **View all row details** opens **Row differences**, which lists the differing rows and highlights each cell that differs from the reference. Selecting up to five results, e.g. all five Composition Validation results, compares them together; files from different partners are matched by position, and the workspace says so.
6. Run **Composition Validation** on any sample: it runs straight away with no warning, since reporting invalid rows is its job. It adds `composition_total_pct`, `processing_status` and `validation_errors`.
7. Optional: upload a downloaded result CSV, even renamed. It is recognised as a result by its columns and can be selected and compared like any other result, so results from an earlier session can be compared. **Compare** is offered for 2–5 results from the same function and says why when it can't run; if results still have different column layouts (an older export against a new one), comparison is refused with a plain explanation.

Each sample has one planted problem (B follow-up's duplicate makes two rows invalid):

| Sample | Invalid row(s) | Reason in `validation_errors` | Valid rows |
| --- | --- | --- | --- |
| `partner_a_baseline.csv` | 8 (A-008) | `mass missing` | 24 |
| `partner_a_followup.csv` | 13 (A-013) | `R-125 out of range` (negative) | 24 |
| `partner_b_baseline.csv` | 5 (B-005) | `mass invalid` (non-numeric weight) | 24 |
| `partner_b_followup.csv` | 10 and 11 (B-010) | `duplicate batch ID B-010` | 23 |
| `partner_c_baseline.csv` | 18 (C-018) | `composition totals 78.37%` | 24 |

Every result ends with `processing_status` (`Valid`/`Invalid`) and `validation_errors`. Invalid rows keep their original values: Mass leaves the masses blank, and Classification writes `Needs review` with a blank `dominant_component`. Validation also adds `composition_total_pct`.

Older exported results remain readable and downloadable unchanged. Compare results from the same function and output schema; if one uses the old columns, regenerate it from its original input before comparing it with a new result. No data reset or migration is required. Processing rejects source-column names that would be overwritten by generated columns.

Composition totals within ±0.5 percentage points of 100% count as valid. Batch Classification uses demo-only thresholds (`DEMO_CLASS_RULES` in `server/src/processing/index.ts`): R-32 ≥ 40% is *R-32-rich*, otherwise R-134a ≥ 34% is *R-134a-rich*, otherwise *Balanced*.

## Known limitations

- Source data is never repaired. A Needs Review input stays Needs Review after processing; fix the CSV and upload it again.
- Both rows of a duplicate batch ID are marked Invalid; neither is picked as the correct one.
- Comparison matches rows by batch ID only when every pair of compared files shares IDs (a partner's baseline and follow-up); files from different partners share none, so their rows are matched by position, up to the longest file. The comparison states which was used. A repeated ID is matched occurrence by occurrence, and a blank ID never matches.
- Only results from the same function and the current column layout can be compared. Regenerate an older result before comparing it with a new one.
- Re-running a function on the same input replaces the earlier result; there is no version history.
- Processing is synchronous and handles one file at a time, which suits interview-sized files. Preview lists the first 100 problem rows in detail.
- Classification thresholds are demo-only, and no purity or recovery is inferred from feed composition.
- Automated tests cover behavior in jsdom; they do not check real-browser layout or visuals.
- `/generator` is a client-side page. The Vite dev and preview servers serve it directly; opening `/generator` directly on the optional Vercel deployment has not been verified.

## Layout

```
client/        React + Vite + Tailwind UI
  src/App.tsx      the file workspace, and Root, which shows the generator at /generator; src/api.ts is the typed API client
  src/components/  Sidebar, FileTable, CompareWorkspace, Modals, GeneratorPage
server/        Fastify API
  src/adapters/    partner header and unit mappings -> one normalized record
  src/processing/  the three processing functions
  src/lib/         csv parse/export, storage (local files, or private Blob via blob-storage.ts), compare, generate
  src/routes/      files.ts: /api/files, /api/files/archive, /api/process, /api/compare, /api/generate
shared/        types and the processor list used by both sides
sample-data/   the five synthetic partner CSVs (never edited)
```

## Deploy

Local development needs no account or cloud service. An optional Vercel deployment (client and server services, private Blob storage) is configured; see [deployment configuration and outstanding checks](blueprint/vercel-deployment.md).

## Extending

- **New partner CSV schema:** add one entry to `ADAPTERS` in `server/src/adapters/index.ts`, listing the column names and the unit factors. To generate it too, add its letter to `GENERATOR_PARTNERS` in `shared/types.ts` and its number formats to `DIGITS` in `server/src/lib/generate.ts`.
- **New processing function:** add an entry to `processors` in `server/src/processing/index.ts`, plus its label in `PROCESSORS` in `shared/types.ts`. Add the id to the Zod enum in `routes/files.ts`.
- **Storage:** `server/src/lib/storage.ts` owns local files and selects the private Blob adapter in `server/src/lib/blob-storage.ts` when a server-side Blob token is configured. Deployed instances share durable objects; local development keeps file storage.
