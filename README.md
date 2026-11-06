# Reclaim Studio

[![CI](https://github.com/lanestrin/icorium/actions/workflows/ci.yml/badge.svg)](https://github.com/lanestrin/icorium/actions/workflows/ci.yml)

Upload partner refrigerant CSVs, run one of three processing functions on every row, export results (original columns + generated columns), and compare two result files.

Interview exercise. All data is fictional and the classification rules are demo-only.

## Run

```bash
npm install
npm run dev       # API on :3001, UI on http://localhost:5173
npm run verify    # every test + the production build
```

## Tests

For the proposed Vercel multi-service setup and durable private Blob storage,
see [deployment configuration and outstanding checks](blueprint/vercel-deployment.md).

| Level | File | What it proves |
| --- | --- | --- |
| Unit (Vitest) | `server/src/core.test.ts` | Unit conversions, validation rules and tolerance, mass maths, classification thresholds, CSV escaping, comparison maths |
| API (Vitest + `app.inject`) | `server/src/api.test.ts` | Every endpoint and error message; each sample file flags exactly its planted problem; results keep every original column and value; saved results compare after re-upload |

`npm test` runs server unit/API tests and client unit/component tests. Client tests use Vitest, React Testing Library and jsdom; API calls are mocked at the client boundary while server behavior has separate API coverage. `npm run verify` also type-checks and builds the client. These replace required manual acceptance checks; they do not establish real-browser layout or visual correctness. Run `npm test -w client` for client tests only.

The five synthetic sample CSVs in `sample-data/` (described in `sample-data/README.txt`) are loaded the first time the server starts. To reset the demo, delete `server/data/`.

Input files without invalid rows are **Ready**; inputs with invalid rows are **Needs Review** and remain selectable for all three functions. The status filter includes both states. Results remain **Processed**, with an **N invalid** tag when applicable. Existing saved file metadata is updated automatically without rewriting CSVs or resetting data.

Filters do not clear selected inputs. Select-all affects the visible input rows, while the processing panel lists every selected filename, including selections hidden by filters. Processing a file does not repair its source data, so an invalid input remains Needs Review after a successful run.

## Demo steps

1. Open **Preview** on `partner_a_baseline.csv` to show its original columns.
2. Click the row to select it, choose **Component Mass Calculation**, and click **Run Processing**. The row shows *Processing…*, then the result preview opens with the new columns highlighted.
3. **Download** the result and open it: every original column is unchanged, and `r32_mass_kg`, `r125_mass_kg`, `r134a_mass_kg`, `processing_status` and `validation_errors` are added at the end. Every result ends with `Valid`/`Invalid` status and the reasons (empty when valid). Invalid rows keep their original values with blank calculated masses; invalid classifications show `Needs review`.
4. Repeat with `partner_a_followup.csv` using the same function. Or check both Partner A files and run once: they are processed in turn, and the two results fill **File A** and **File B** in the footer.
5. In the footer, pick both results as **File A** and **File B** and click **Compare Selected**. The chart shows per-row kg values. The summary shows total kg per component and how many rows differ.
6. Optional: upload a downloaded result CSV. It is recognised as a result and appears in the compare dropdowns, so results from an earlier session can be compared.
7. Show the validation rules: input samples show **Needs Review** and every file with problem rows carries an **N invalid** tag in the list. Preview lists those rows and highlights them; comparison shows each file's problems in its own card (A or B). Each sample has one planted problem: missing mass (A baseline), negative R-125 (A follow-up), non-numeric weight (B baseline), duplicate lot number (B follow-up, two invalid rows) and fractions that don't sum to 1 (C baseline).

Older exported results remain readable and downloadable unchanged. Compare results from the same function and output schema; if one uses the old columns, regenerate it from its original input before comparing it with a new result. No data reset or migration is required. Processing rejects source-column names that would be overwritten by generated columns.

Composition totals within ±0.5 percentage points of 100% count as valid. Batch Classification uses demo-only thresholds (`DEMO_CLASS_RULES` in `server/src/processing/index.ts`): R-32 ≥ 40% is *R-32-rich*, otherwise R-134a ≥ 34% is *R-134a-rich*, otherwise *Balanced*.

## Layout

```
client/   React + Vite + Tailwind UI (App, Sidebar, FileTable, CompareFooter, Modals)
server/   Fastify API
  src/adapters/    partner header and unit mappings -> one normalized record
  src/processing/  the three processing functions
  src/lib/         csv parse/export, local storage, compare
  src/routes/      /api/files, /api/process, /api/compare
shared/   types shared by client and server
```

## Extending

- **New partner CSV schema:** add one entry to `ADAPTERS` in `server/src/adapters/index.ts`, listing the column names and the unit factors.
- **New processing function:** add an entry to `processors` in `server/src/processing/index.ts`, plus its label in `PROCESSORS` in `shared/types.ts`. Add the id to the Zod enum in `routes/files.ts`.
- **Storage:** `server/src/lib/storage.ts` owns local files and selects the private Blob adapter in `server/src/lib/blob-storage.ts` when a server-side Blob token is configured. Deployed instances share durable objects; local development keeps file storage.
