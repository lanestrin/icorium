# Reclaim Studio

[![CI](https://github.com/lanestrin/icorium/actions/workflows/ci.yml/badge.svg)](https://github.com/lanestrin/icorium/actions/workflows/ci.yml)

Upload partner refrigerant CSVs, run one of three processing functions on every row, export results (original columns + generated columns), and compare two result files.

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
| Unit (Vitest) | `server/src/core.test.ts` | Unit conversions, validation rules and tolerance, mass maths, classification thresholds, CSV escaping, comparison maths |
| API (Vitest + `app.inject`) | `server/src/api.test.ts` | Every endpoint and error message; all three functions on all five samples: exact invalid rows and reasons, every original column and value kept, download, renamed re-upload and compare |
| Unit + API (Vitest, Blob SDK mocked in memory) | `server/src/blob-storage.test.ts` | The private Blob storage adapter: shared files across instances, atomic result replacement, idempotent sample seeding, conflict and failure handling, and refusing a Vercel start without storage configured |
| Unit (Vitest) | `client/src/file-status.test.ts` | Input eligibility, status precedence, when the Data Quality Warning appears and its per-file counts |
| Component (Vitest + React Testing Library) | `client/src/App.test.tsx` | Upload success and failure; selection and status/search/date filters; processing locks, failure and retry; warning dialog counts, cancel/confirm, focus and duplicate clicks; preview paging and errors; compare-footer choices, the comparison modal and comparison errors |

`npm test` runs server unit/API tests and client unit/component tests. Client tests use Vitest, React Testing Library and jsdom; API calls are mocked at the client boundary while server behavior has separate API coverage. `npm run verify` also type-checks and builds the client. These replace required manual acceptance checks; they do not establish real-browser layout or visual correctness. Run `npm test -w client` for client tests only.

## File status and selection

Input files without invalid rows are **Ready**; inputs with invalid rows are **Needs Review** and remain selectable for all three functions. The status filter includes both states. Results remain **Processed**, with an **N invalid** tag when applicable. Existing saved file metadata is updated automatically without rewriting CSVs or resetting data.

Filters do not clear selected inputs. Select-all affects the visible input rows, while the processing panel lists every selected filename, including selections hidden by filters. Processing a file does not repair its source data, so an invalid input remains Needs Review after a successful run.

## Demo steps

1. Open **Preview** on `partner_a_baseline.csv` to show its original columns. It is **Needs Review** with a **1 invalid** tag; Preview lists and highlights row 8 (`mass missing`).
2. Click the row to select it, choose **Component Mass Calculation**, and click **Run Processing**. A **Data Quality Warning** lists the file with *24 valid rows · 1 invalid row* and explains that valid rows will be calculated, while invalid rows stay in the output with error details and no calculated values. Click **Process Valid Rows**. The row shows *Processing…*, then the result preview opens with the new columns highlighted. (**Cancel** sends nothing and keeps the selection.)
3. **Download** the result and open it: every original column is unchanged, and `r32_mass_kg`, `r125_mass_kg`, `r134a_mass_kg`, `processing_status` and `validation_errors` are added at the end. Row 8 is `Invalid` with `mass missing` and blank masses; every other row is `Valid` with an empty `validation_errors`.
4. Check both Partner A files and run **Component Mass Calculation** once. The warning lists both files with their counts; after **Process Valid Rows** they are processed in turn, and the two results fill **File A** and **File B** in the footer. (Running each file on its own works too.)
5. Click **Compare Selected**. The chart shows per-row kg values (row 8 of A and row 13 of B have no value). The summary shows total kg per component and how many rows differ, and each file's invalid rows appear in its own card (A or B).
6. Run **Composition Validation** on any sample: it runs straight away with no warning, since reporting invalid rows is its job. It adds `composition_total_pct`, `processing_status` and `validation_errors`.
7. Optional: upload a downloaded result CSV, even renamed. It is recognised as a result by its columns and appears in the compare dropdowns, so results from an earlier session can be compared. **File B** only offers results from the same function as **File A**; if two results still have different column layouts (an older export against a new one), comparison is refused with a plain explanation.

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
- Comparison pairs rows by their position in each file, not by batch ID, up to the longer file's row count.
- Only results from the same function and the current column layout can be compared. Regenerate an older result before comparing it with a new one.
- Re-running a function on the same input replaces the earlier result; there is no version history.
- Processing is synchronous and handles one file at a time, which suits interview-sized files. Preview lists the first 100 problem rows in detail.
- Classification thresholds are demo-only, and no purity or recovery is inferred from feed composition.
- Automated tests cover behavior in jsdom; they do not check real-browser layout or visuals.

## Layout

```
client/        React + Vite + Tailwind UI
  src/App.tsx      the one screen; src/api.ts is the typed API client
  src/components/  Sidebar, FileTable, CompareFooter, Modals
server/        Fastify API
  src/adapters/    partner header and unit mappings -> one normalized record
  src/processing/  the three processing functions
  src/lib/         csv parse/export, storage (local files, or private Blob via blob-storage.ts), compare
  src/routes/      files.ts: /api/files, /api/process, /api/compare
shared/        types and the processor list used by both sides
sample-data/   the five synthetic partner CSVs (never edited)
```

## Deploy

Local development needs no account or cloud service. An optional Vercel deployment (client and server services, private Blob storage) is configured; see [deployment configuration and outstanding checks](blueprint/vercel-deployment.md).

## Extending

- **New partner CSV schema:** add one entry to `ADAPTERS` in `server/src/adapters/index.ts`, listing the column names and the unit factors.
- **New processing function:** add an entry to `processors` in `server/src/processing/index.ts`, plus its label in `PROCESSORS` in `shared/types.ts`. Add the id to the Zod enum in `routes/files.ts`.
- **Storage:** `server/src/lib/storage.ts` owns local files and selects the private Blob adapter in `server/src/lib/blob-storage.ts` when a server-side Blob token is configured. Deployed instances share durable objects; local development keeps file storage.
