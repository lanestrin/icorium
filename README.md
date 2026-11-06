# Reclaim Studio

[![CI](https://github.com/lanestrin/icorium/actions/workflows/ci.yml/badge.svg)](https://github.com/lanestrin/icorium/actions/workflows/ci.yml)

Upload partner refrigerant CSVs, run one of three processing functions on every row, export results (original columns + generated columns), and compare two result files.

Interview exercise. All data is fictional and the classification rules are demo-only.

## Run

```bash
npm install
npx playwright install chromium   # once, for the browser tests
npm run dev       # API on :3001, UI on http://localhost:5173
npm run verify    # every test + the production build
```

## Tests

| Level | File | What it proves |
| --- | --- | --- |
| Unit (Vitest) | `server/src/core.test.ts` | Unit conversions, validation rules and tolerance, mass maths, classification thresholds, CSV escaping, comparison maths |
| API (Vitest + `app.inject`) | `server/src/api.test.ts` | Every endpoint and error message; each sample file flags exactly its planted problem; results keep every original column and value; saved results compare after re-upload |
| Browser (Playwright) | `e2e/checklist.spec.ts` | The final acceptance checklist in `blueprint/build-plan.md`, end to end in Chromium |
| Browser (Playwright) | `e2e/usability.spec.ts` | Filters, keyboard use and dialog focus, select-all, phone width |

`npm test` runs the first two in about 2 seconds. `npm run test:e2e` runs the browser tests in about 30 seconds on their own ports and data, so the dev server can keep running.

The five synthetic sample CSVs in `sample-data/` (described in `sample-data/README.txt`) are loaded the first time the server starts. To reset the demo, delete `server/data/`.

## Demo steps

1. Open **Preview** on `partner_a_baseline.csv` to show its original columns.
2. Click the row to select it, choose **Component Mass Calculation**, and click **Run Processing**. The row shows *Processing…*, then the result preview opens with the new columns highlighted.
3. **Download** the result and open it: every original column is unchanged, and `r32_mass_kg`, `r125_mass_kg`, `r134a_mass_kg` and `mass_status` are added at the end. Invalid rows are kept and marked `Skipped (invalid input)`.
4. Repeat with `partner_a_followup.csv` using the same function. Or check both Partner A files and run once: they are processed in turn, and the two results fill **File A** and **File B** in the footer.
5. In the footer, pick both results as **File A** and **File B** and click **Compare Selected**. The chart shows per-row kg values. The summary shows total kg per component and how many rows differ.
6. Optional: upload a downloaded result CSV. It is recognised as a result and appears in the compare dropdowns, so results from an earlier session can be compared.
7. Show the validation rules: run **Composition Validation** on each file. Each one has one planted problem: missing mass (A baseline), negative R-125 (A follow-up), non-numeric weight (B baseline), duplicate lot number (B follow-up) and fractions that don't sum to 1 (C baseline).

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
- **Different storage:** only `server/src/lib/storage.ts` reads or writes the disk.
