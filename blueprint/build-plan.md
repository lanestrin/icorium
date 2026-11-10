# Reclaim Studio — Build Plan

**Project:** Icorium full-stack coding exercise  
**Goal:** Deliver the complete CSV workflow in one straightforward application, using the agreed Apple-inspired two-column UI.  
**Stack:** React + TypeScript + Vite + Tailwind CSS + Lucide React; Node.js + Fastify + TypeScript; Papa Parse; Zod; Recharts; Vitest; local file storage.  
**Status:** All planned features merged; 9.3 archive tabs awaiting review. See section 4.

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
- **Right file workspace:** one-line “CSV Files” heading/subtitle; search; upload-date range filter; status filter (**All / Ready / Needs Review / Processing / Processed / Error**); **Active Files** / **Archived** tabs with counts (since 9.3); scrollable file table with filename, rows, columns, upload date, status, **Preview** and **Download**.
- **Select files:** every row has a checkbox (or click the row); a header checkbox selects all visible rows. **Run Processing** processes every checked input in turn with the chosen function; checked results are ignored by it (since 9.2, results are selectable so they can be archived). While rows are checked, a selection bar at the top of the table offers **Archive N files** (or **Restore N files** in the Archived tab) for the checked rows in view; archived rows also have a ⋯ menu with **Restore file**. Do *not* add compare buttons to each row.
- **Processing feedback:** the selected input row displays a spinner and **Processing…** while the request runs; if it fails, show **Error** and an actionable message. On success, keep the input available and add a **new processed result file** to the list.
- **Fixed bottom comparison footer:** **File A** dropdown, **File B** dropdown, **Compare Selected**. Populate with compatible processed results. Button disabled until two distinct files are selected.

### Modals

- **CSV Preview modal:** filename, row/column count, scrollable or paginated row preview, original headers, close button. Avoid rendering enormous datasets all at once.
- **Processed Results modal:** opens after successful processing; table shows original columns **plus** generated result columns; download action.
- **Comparison modal:** opens on **Compare Selected**; names of both files, a graph, concise difference table, close button; no permanent graph on the main screen.

**Design constraint:** modern Apple-inspired simplicity: light neutral background, restrained blue/green accents, clear typography, generous whitespace, modest borders/shadows, and no unnecessary dashboard or navigation.

## 3. Repository layout

```text
icorium/
├── client/
│   └── src/
│       ├── App.tsx           # The one workspace screen
│       ├── api.ts            # Typed API client
│       ├── components/       # Sidebar, FileTable, CompareFooter, Modals
│       └── *.test.ts(x)      # Unit and component tests
├── server/
│   └── src/
│       ├── routes/files.ts   # Upload, list, rows, process, download, compare
│       ├── adapters/         # Partner A/B/C CSV mapping
│       ├── processing/       # Three independent functions and shared row validation
│       ├── lib/              # CSV parse/export, storage (local or private Blob), compare
│       └── *.test.ts         # Unit and API tests
├── shared/types.ts           # Common TypeScript types and the processor list
├── sample-data/              # Five synthetic partner CSVs
├── blueprint/                # Plan, stack, commit rules, feature records
└── README.md                 # Setup, tests, demo steps, limitations
```

A single repository and **one API** are sufficient. Avoid microservices, task queues, authentication, and a database for the first version.

## 4. Feature build order

Each numbered item is one work item: one branch, one reviewed scope, one small
PR. This replaces the phase checklist; the requirements elsewhere in this
plan still apply. IDs retain their original phase prefix for traceability.

### What to build next

**Next: none planned.** 9.3 is implemented and awaiting review.
New work needs a new request. Add it as a new stable ID with its scope before
building, or use a `fix/` branch for a bug.

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

- [x] **8.3** `feature/8.3-data-quality-warning` — Before Mass or Classification runs on selected inputs with invalid rows, show a **Data Quality Warning** dialog with valid/error row counts per file. Explain: "Valid rows will be calculated. Invalid rows will remain in the output with error details and no calculated values." Provide **Cancel** and **Process Valid Rows**. Validation runs without this warning.

  **Result:** merged in PR #13 (`9425c11`); automated verification passed (2026-11-09). See [feature scope and results](features/8.3-data-quality-warning.md).
  **Depends on:** 8.1 and 8.2.
  **Done when:** a mixed selection reports each affected file correctly;
  Cancel sends no processing requests; confirmation processes the selected
  files once; clean inputs and Validation do not trigger the warning. Counts
  and subsequent processing refer to the same selected files. Preserve dialog
  focus, close behavior and responsive layout in the implementation.
  **Verification:** unit/API coverage for any new logic or endpoint changes;
  component tests for warning counts, cancel/confirm, mixed selections,
  keyboard close/focus and duplicate submission protection; `npm run verify`.

- [x] **8.4** `feature/8.4-partial-processing-demo` — Update README examples and the interview walkthrough for the new columns, Needs Review status and confirmation dialog; verify all three functions against all five samples and the saved-result round trip.

  **Result:** merged in PR #14 (`0b87809`); automated verification passed (2026-11-09). The API contract test pins every sample's invalid rows and reasons for all three functions. See [feature scope and results](features/8.4-partial-processing-demo.md).
  **Depends on:** 8.1–8.3.
  **Done when:** the documented walkthrough matches the running UI; sample
  counts match 8.1; invalid rows remain with reasons and no invented values;
  Validation has no confirmation step; incompatible comparisons still explain
  the error. Document known limitations.
  **Verification:** `npm run verify`, sample/API regression evidence and review
  of the walkthrough against the implementation. Do not
  reintroduce browser tests or change the sample CSVs.

**Interview answer (M8 built):** unreadable/unmappable files are rejected;
otherwise every row is checked, valid rows are processed, invalid rows stay in
the output marked Invalid with their reason and no calculated values, and the
user confirms before Mass or Classification calculates on a file with problems.

### M9 — UI refinements

- [x] **9.1** `feature/9.1-remove-invalid-row-tags` — Remove the amber **N invalid** tag from every file-table row (inputs and results), at the person's request on 2026-11-09 (they chose "everywhere"). This supersedes the tag from 8.2. Inputs still show **Needs Review**. Invalid rows stay visible in Preview's problem panel, the Data Quality Warning counts and the comparison cards. `problemRows` and all API behavior are unchanged.

  **Result:** merged in PR #16 (`3cae28a`); automated verification passed (2026-11-09).
  **Done when:** no row shows the tag; the status badge, filter, selection and warning behavior are unchanged; docs no longer mention the tag.
  **Verification:** component test asserts no tag on clean, Needs Review and Processed rows; `npm run verify`.

- [x] **9.2** `feature/9.2-batch-archive` — Select files (inputs and results), click **Archive** to hide them from the list, and bring them back with **Restore**, at the person's request on 2026-11-09 (they chose archive over delete, and the label **Restore** over "Unarchive"). Archiving sets an `archived` flag through `POST /api/files/archive` (`ids`, `archived`); no CSV is moved or deleted. A new **Archived** option in the Status filter shows only archived files, and there the button reads **Restore**. The button acts only on checked rows in view. Archived files are excluded from Run Processing (the API also refuses them) and from the compare dropdowns; a compare choice is cleared when its file is archived. Result rows become selectable so they can be archived; Run Processing still uses only checked inputs. Re-running a function replaces an archived result with a new, unarchived one.

  **Result:** merged in PR #18 (`14a6b94`); automated verification and CI passed (2026-11-09). The Archived status option and filter-bar button were replaced in 9.3.
  **Done when:** archive and restore round-trip without changing any other metadata or CSV; a missing id changes nothing (404); invalid bodies are rejected; archived inputs cannot be processed; the Archived view, Clear filters, selection, compare pickers and Run Processing behave as above.
  **Verification:** API tests for archive/restore, 404, validation, processing refusal and re-run; component tests for archive, restore, hidden selections, failure, double click, keyboard, compare pickers and processing exclusion; `npm run verify`.

- [x] **9.3** `feature/9.3-archive-tabs` — Make archived files easy to find and restore, at the person's request on 2026-11-09 after reviewing 9.2 (restoring was hidden in the Status dropdown, and they disliked the Archive button in the filter bar; they chose tabs plus a selection bar, then supplied a mockup to follow). **Active Files** / **Archived** tabs with counts sit above the table and replace the Archived status option. While rows in view are selected, a bar at the top of the table shows "N selected", **Clear selection** and a primary **Archive N files** (or **Restore N files**) button. A top-right toast confirms each archive or restore, offers **Undo** (not on an undo) and hides after 8 seconds. The Archived tab shows a note that archived files are excluded from processing and comparison, sorts by **Archived On** (newest first) beside **Original Upload**, and replaces Preview/Download with a ⋯ menu (**Preview file**, **Download file**, **Restore file**; arrow keys, Escape, click outside). Rows show a file icon. The API now stores `archivedAt` when archiving and clears it on restore; files archived before this show "—" and sort last. Filters apply within the current tab.

  **Result:** implemented; automated verification passed (2026-11-09), awaiting review and PR.
  **Done when:** tabs show correct counts and switch by click and arrow keys; the selection bar appears only with selected rows in view and clears them; bulk archive, bulk restore, menu restore and Undo call the API with the right ids and report success or failure; archived rows sort by archive time; the Status filter no longer offers Archived; 9.2's processing and compare exclusions still hold.
  **Verification:** API test for `archivedAt` set and cleared; component tests for tabs, counts, keyboard, selection bar, toast and Undo, auto-hide, row menu (mouse and keyboard), sorting and columns, failures, empty state, double click and exclusions; `npm run verify`.

### M7 — Final interview readiness

- [x] **7.1** `feature/7.1-interview-readiness` — Review final interview documentation and automated verification after partial processing and any explicitly requested UI changes. This is an integration review, not a redesign.

  **Result:** merged in PR #15 (`d28064b`); automated verification passed (2026-11-09). Added client component coverage for upload, preview paging, compare footer and comparison. Aligned README, plan layout and stack doc with the code. See [feature scope and results](features/7.1-interview-readiness.md).
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

1. Open **Preview** on `partner_a_baseline.csv`: original columns, **Needs Review** status and the highlighted row 8 (`mass missing`).
2. Select it, choose **Component Mass Calculation**, click **Run Processing**. The **Data Quality Warning** shows 24 valid / 1 invalid; click **Process Valid Rows**.
3. Show the row spinner (when visible), then the processed results modal.
4. Download the result CSV: original columns intact, generated columns appended, row 8 `Invalid` with its reason and blank masses.
5. Check both Partner A files and run the same function once; confirm the warning. Both results fill the footer.
6. Click **Compare Selected** and point out the graph's measured differences and each file's invalid-row card.
7. Run **Composition Validation** to show it needs no confirmation, then explain how a fourth adapter or processing function would be added.

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
