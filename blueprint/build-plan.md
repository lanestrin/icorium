# Reclaim Studio — Build Plan

**Project:** Icorium full-stack coding exercise  
**Goal:** Deliver the complete CSV workflow in one straightforward application, using the agreed Apple-inspired two-column UI.  
**Stack:** React + TypeScript + Vite + Tailwind CSS + Lucide React; Node.js + Fastify + TypeScript; Papa Parse; Zod; Recharts; Vitest; local file storage.  
**Status:** Baseline implemented; warning dialog, demo documentation and final readiness remain. See the next feature in section 4.

## 1. What “done” means

A non-technical user can:

1. **Load a CSV** through a normal file chooser and preview its actual rows.
2. **Select one input file** and one of three processing functions.
3. **Run processing on every row** and inspect the generated results within the application.
4. **Save a new CSV** that retains *all original input columns* and appends the generated result columns.
5. **Load two previously generated result CSVs** and compare them in a modal with at least one graph illustrating differences.

This is a general-purpose interview exercise illustrated with synthetic refrigerant-batch data, **not** a production chemical-engineering system. The brief requires the workflow; it does **not** require a database, partner accounts, permanent cloud storage, real-time sensors, or an analytics dashboard.

## 2. Frozen UI scope

### Main desktop screen

- **Left control column:** CSV upload/drop area; three processing functions; selected input filename; **Run Processing** button.
- **Right file workspace:** one-line “CSV Files” heading/subtitle; search; upload-date range filter; status filter (**All / Ready / Processing / Processed / Error**); scrollable file table with filename, rows, columns, upload date, status, **Preview** and **Download**.
- **Select files for processing:** each input row has a checkbox (or click the row); a header checkbox selects all visible inputs. **Run Processing** processes every checked file in turn with the chosen function. Result rows are not selectable. Do *not* add compare buttons to each row.
- **Processing feedback:** the selected input row displays a spinner and **Processing…** while the request runs; if it fails, show **Error** and an actionable message. On success, keep the input available and add a **new processed result file** to the list.
- **Fixed bottom comparison footer:** **File A** dropdown, **File B** dropdown, **Compare Selected**. Populate with compatible processed results. Button disabled until two distinct files are selected.

### Modals

- **CSV Preview modal:** filename, row/column count, scrollable or paginated row preview, original headers, close button. Avoid rendering enormous datasets all at once.
- **Processed Results modal:** opens after successful processing; table shows original columns **plus** generated result columns; download action.
- **Comparison modal:** opens on **Compare Selected**; names of both files, a graph, concise difference table, close button; no permanent graph on the main screen.

**Design constraint:** modern Apple-inspired simplicity: light neutral background, restrained blue/green accents, clear typography, generous whitespace, modest borders/shadows, and no unnecessary dashboard or navigation.

## 3. Repository layout

```text
reclaim-studio/
├── client/
│   └── src/
│       ├── components/       # FileTable, UploadArea, ProcessPanel, modals, CompareFooter
│       ├── pages/            # One main workspace
│       ├── lib/              # Typed API client and UI helpers
│       └── types/
├── server/
│   └── src/
│       ├── routes/           # Upload, list, preview, process, download, compare
│       ├── adapters/         # Partner A/B/C CSV mapping
│       ├── processing/       # Three independent functions
│       ├── lib/              # CSV parsing, validation, file storage
│       └── tests/
├── shared/                   # Common TypeScript types and result metadata
├── sample-data/              # Five synthetic partner CSVs
└── README.md                 # Setup, commands, design choices, demo steps
```

A single repository and **one API** are sufficient. Avoid microservices, task queues, authentication, and a database for the first version.

## 4. Feature build order

Each numbered item is one work item: one branch, one reviewed scope, one small
PR. This replaces the phase checklist; the requirements elsewhere in this
plan still apply. IDs retain their original phase prefix for traceability.

### What to build next

**Next: 8.3 — Data Quality Warning dialog.**
Branch: `feature/8.3-data-quality-warning`.

8.1 and 8.2 are merged. On 2026-11-06 the person confirmed filters work and
removed the remaining manual UI acceptance gates. Start by reviewing App's
processing flow and preparing the warning dialog scope and acceptance criteria.

**Selection rule:** take the first unchecked item below whose dependencies are
satisfied. Completed baseline capabilities are not new work. If an item is
blocked, name the blocker and the next eligible item; do not silently skip it.
After completing an item, update this recommendation to the next eligible ID.
For a future request such as "what next?", report the ID, title, branch, why it
is next, and one concrete starting action.

### Rules for features

- Stable IDs are never reused or renumbered. Split a large item into lettered
  sub-items (`8.1a`, `8.1b`) before implementation if necessary; document their
  order and dependencies. Keep each PR reviewable.
- Describe scope, dependencies, acceptance and verification before building.
  Review the affected code; the plan describes intent, not proof of behavior.
- Mark an item complete only when its acceptance criteria have evidence. Add
  the PR or commit and result beside it. Unit and component tests replace manual UI checklists
  for completion; do not claim unperformed checks passed.
- Use a named feature branch, then implement and run `npm run verify`, use
  `/complete` to prepare review drafts, and wait for `/approve` before commit,
  push and PR publication. The person squash-merges the PR.
- Automated verification is server unit/API tests, client unit/component tests
  and client type-check/build. UI changes require behavior-focused component
  coverage, including relevant interactions and async success/failure paths.
  Manual UI acceptance passes are not required, and the person is not expected
  to perform them. Browser tests remain removed; restore them only when requested.
- Bugs use a `fix/` branch. Unspecified visual refinements need a concrete
  request or approved reference change before becoming features.

### Existing implementation baseline (former phases 1–7)

These capabilities exist in the current code; this is an inventory, not a claim
that every browser interaction has been verified. Preserve them during new work.

| Former phase | Existing capability | Evidence/location |
| --- | --- | --- |
| 1 | Vite/React client, Fastify API, shared contracts, local sample data and startup commands | `package.json`, `client/`, `server/`, `shared/types.ts`, `sample-data/`, `README.md` |
| 2 | Two-column workspace, file table, filters, selection, preview/results/comparison dialogs and fixed/collapsible comparison footer | `client/src/App.tsx`, `client/src/components/` |
| 3 | Upload, schema detection, normalization, validation, file metadata and paginated preview | `server/src/adapters/`, `server/src/routes/files.ts`, `server/src/lib/`, core/API tests |
| 4 | Validation, component mass and demo classification; every row retained; processing feedback and results preview | `server/src/processing/index.ts`, `shared/types.ts`, `client/src/App.tsx`; unified invalid-row behavior remains 8.1 |
| 5 | CSV export preserving source headers/values, generated columns, escaping, preview/download and local storage | `server/src/lib/csv.ts`, `server/src/lib/storage.ts`, core/API tests |
| 6 | Two compatible saved or re-uploaded results, schema-based detection, comparison metrics/graphs and readable errors | `server/src/lib/compare.ts`, routes, `client/src/components/Modals.tsx`, core/API tests |
| 7 | Vitest unit/API tests and client type-check/build | `server/src/core.test.ts`, `server/src/api.test.ts`, `npm run verify` |

Result names remain `result_<input name without .csv>_<function id>.csv`.
Re-running the same function replaces that result. A result is recognized by
its columns even if renamed. Preserve all original rows, headers, cell strings
and column order; processors append generated columns only. Do not edit samples.

### M8 — Partial processing

**Principle:** never silently correct bad data or calculate misleading results.
Validate every row, process valid rows, and keep invalid rows with their reasons.
Block a whole file only when it is unreadable or cannot map to a partner schema.

| Error type | Example | Required behavior |
| --- | --- | --- |
| File-level | Missing required columns, unsupported format, malformed CSV | Reject with a clear message; existing behavior |
| Row-level | Missing mass, negative percentage, nonnumeric value, missing or duplicate batch ID | Keep the row and reason; skip its calculation |
| Allowed input | Extra columns, composition within ±0.5 percentage points of 100% | Allow; do not add a noisy warning list for rounding |

- [x] **8.1** `feature/8.1-shared-row-validation` — Use the same Composition Validation rules for all three functions, including missing and duplicate batch IDs. End every result with `processing_status` (`Valid` / `Invalid`) and `validation_errors` (empty when valid), replacing `validation_status`, `validation_message` and `mass_status`. Validation retains `composition_total_pct`; invalid mass rows have empty calculated values and invalid classification rows use `Needs review`. Update result detection and comparison so newly exported or renamed/re-uploaded results work in this same PR.

  **Result:** merged in PR #3 (`7a8ac14`); automated verification passed. See [feature scope and results](features/8.1-shared-row-validation.md).
  **Depends on:** existing processing, export and comparison baseline.
  **Done when:** unit/API tests prove consistent invalid-row decisions across
  all functions, unchanged source columns and row counts, correct final column
  order, blank invalid mass values, `Needs review` classification, and result
  recognition/download/re-upload/comparison for the new schema. For each sample,
  expect 24 valid rows (23 for B follow-up) with the known invalid rows retained.
  Review existing saved-result compatibility before building; document whether
  legacy columns remain accepted rather than silently breaking saved files.
  **Verification:** extend `server/src/core.test.ts` and `server/src/api.test.ts`;
  run `npm run verify`. No new UI or browser testing framework in this feature.

- [x] **8.2** `feature/8.2-needs-review-status` — Show invalid input files as **Needs Review** with an **N invalid** tag and add that status to the filter. Results remain **Processed** with the invalid-row tag. Keep processing/error feedback and file eligibility consistent with the new input status.

  **Result:** merged in PR #4 (`6f08728`); automated verification passed (96 server tests, 13 client unit/component tests and client build on 2026-11-06). Person confirmed filters work and removed remaining manual UI acceptance gates. See [scope and verification status](features/8.2-needs-review-status.md).
  **Depends on:** 8.1.
  **Done when:** metadata/list API and UI agree on status and invalid counts;
  Ready inputs have no invalid rows; Needs Review inputs remain selectable;
  result files remain unselectable for processing; the status filter includes
  and correctly filters Needs Review. Existing stored metadata is handled
  consistently rather than leaving older files mislabeled.
  **Verification:** API tests for statuses/counts; unit/component tests for
  eligibility, filtering, selection, processing locks and failure/retry;
  `npm run verify`.

- [ ] **8.3** `feature/8.3-data-quality-warning` — Before Mass or Classification runs on selected inputs with invalid rows, show a **Data Quality Warning** dialog with valid/error row counts per file. Explain: "Valid rows will be calculated. Invalid rows will remain in the output with error details and no calculated values." Provide **Cancel** and **Process Valid Rows**. Validation runs without this warning.

  **Depends on:** 8.1 and 8.2.
  **Done when:** a mixed selection reports each affected file correctly;
  Cancel sends no processing requests; confirmation processes the selected
  files once; clean inputs and Validation do not trigger the warning. Counts
  and subsequent processing refer to the same selected files. Preserve dialog
  focus, close behavior and responsive layout in the implementation.
  **Verification:** unit/API coverage for any new logic or endpoint changes;
  component tests for warning counts, cancel/confirm, mixed selections,
  keyboard close/focus and duplicate submission protection; `npm run verify`.

- [ ] **8.4** `feature/8.4-partial-processing-demo` — Update README examples and the interview walkthrough for the new columns, Needs Review status and confirmation dialog; verify all three functions against all five samples and the saved-result round trip.

  **Depends on:** 8.1–8.3.
  **Done when:** the documented walkthrough matches the running UI; sample
  counts match 8.1; invalid rows remain with reasons and no invented values;
  Validation has no confirmation step; incompatible comparisons still explain
  the error. Document known limitations.
  **Verification:** `npm run verify`, sample/API regression evidence and review
  of the walkthrough against the implementation. Do not
  reintroduce browser tests or change the sample CSVs.

**Interview answer after M8 is built:** unreadable/unmappable files are rejected;
otherwise every row is checked, valid rows are processed, invalid rows stay in
the output marked Invalid with their reason and no calculated values, and the
user confirms before calculating on a file with problems. This is target
behavior until 8.1–8.4 are complete, not a claim about today's application.

### M7 — Final interview readiness

- [ ] **7.1** `feature/7.1-interview-readiness` — Review final interview documentation and automated verification after partial processing and any explicitly requested UI changes. This is an integration review, not a redesign.

  **Depends on:** 8.1–8.4 and any subsequently approved UI feature affecting the demo.
  **Done when:** README setup and demo instructions match the implementation;
  unit/API and component coverage supports the CSV workflow; known limitations are documented.
  No manual browser, keyboard, phone or alternate-browser checklist is required.
  **Verification:** `npm run verify` and documentation/code review. Do not
  describe unperformed browser checks as passed.

## 5. Minimal API outline (suggested, not prescribed)

| Action | Example route | Result |
| --- | --- | --- |
| Upload CSV | `POST /api/files` | File ID + metadata |
| List/filter files | `GET /api/files` | Files with status and counts |
| Preview rows | `GET /api/files/:id/preview` | Headers + limited/pageable rows |
| Run one function | `POST /api/process` | Result file ID + status |
| Download CSV | `GET /api/files/:id/download` | Original or processed CSV |
| Compare two results | `GET /api/compare?a=<id>&b=<id>` | Compatible comparison metrics/chart data |

For the **interview-sized datasets**, synchronous processing is acceptable if responsive. Still show a Processing state during the request; don't add a queue unless measured workloads justify it.

## 6. Data and correctness decisions

- The five sample files represent **three fictional partners** with different source headers and units. They are synthetic, not actual Icorium records.
- A normalized batch includes `batch_id`, `sample_date`, `feed_mass_kg`, `r32_pct`, `r125_pct`, `r134a_pct`, and `source_company`.
- The original CSV row must be kept separately from normalized fields so that exports preserve the original values.
- Composition totals should be checked with a **documented rounding tolerance** rather than requiring exact floating-point equality.
- An invalid row still appears in processing output with errors rather than disappearing silently.
- Show chart labels with units and whether values represent a sum, average, or count.
- **Do not infer purity or actual separation recovery** from incoming blend composition alone.

## 7. Priority order if time is tight

**P0 — Must work:** file chooser → view input rows → choose function → process every row → view results → export new CSV with original + generated columns → load two result files → comparison graph.

**P1 — Strong usability:** table selection, processing spinner, preview modals, clear validation messages, file search and status filter.

**P2 — Nice but nonessential:** date-range filter, extra pagination controls, richer visual polish, persist file list across restarts.

If time is limited, prioritize **working P0 functionality over appearance refinements**. The fixed comparison footer and modal should stay simple.

## 8. Suggested interview demo script

1. Upload `partner_a_baseline.csv`; open **Preview** and explain the file's original columns.
2. Select the file, choose **Component Mass Calculation**, click **Run Processing**.
3. Show the row spinner (when visible), then open the processed results modal.
4. Download the new result CSV and show that original columns remain intact.
5. Repeat with `partner_a_followup.csv` and the same function.
6. Load/select those two **processed result** CSVs in the footer and open **Compare Selected**.
7. Point out the graph's measured differences, the input validation behavior, and how a fourth adapter or processing function would be added.

**Be ready to explain tradeoffs:** why TypeScript for both ends, why Fastify, why local CSV storage instead of a database, why only two comparison files at a time, and how the code handles changing requirements.

## 9. Required product capabilities

These describe product scope, not a manual testing checklist for the person.

- User selects/loads a CSV and views it inside the application.
- User chooses **one of three** processing functions.
- Selected function executes on **all rows**, and results are displayed.
- New CSV is saved with **all original columns plus generated columns**.
- User can **load two previously generated result CSVs** and compare them.
- At least one graph clearly helps identify differences.
- Every workflow is reachable in one app with normal file selectors, no code edits.
- Implementation demonstrates maintainability, frontend, backend logic, file handling, and visualization.
- Tests and README support a repeatable in-person demo.

---

**Scope guardrail:** Do not add a dashboard, user accounts, PostgreSQL/Convex, cloud deployment, AI recommendations, or complex industrial process models unless a new requirement justifies them.
