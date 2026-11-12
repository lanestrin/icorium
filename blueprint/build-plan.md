# Reclaim Studio — Build Plan

> **Revision — 2026-11-11:** Clarified that File ID and filename are independent; duplicate names are allowed; every original upload gets a fresh base ID; outputs use `-V`/`-M`/`-C`; re-runs require confirmation and replace the same result ID. Added 11.3a for atomic creation and 11.6 for identity regression. Existing imported-result lineage remains an explicit unresolved policy, rather than assuming a new meaning. Historical completed milestones and PR references retained.

**Project:** Icorium full-stack coding exercise  

**Goal:** Deliver the complete CSV workflow in one straightforward application, using the agreed Apple-inspired two-column UI.  

**Stack:** React + TypeScript + Vite + Tailwind CSS + Lucide React; Node.js + Fastify + TypeScript; Papa Parse; Zod; Recharts; Vitest; local file storage.  

**Status (as reported in the supplied plan, not independently verified against the repository):** M8–M9 and 10.1–10.3 are recorded as merged; 11.1–11.2 are recorded as merged; 11.3 is implemented and awaiting review/PR; 11.4–11.5 and the remaining M10 items are pending. This revision records the agreed filename/ID contract and additional correctness work. Historical completion records are retained as records, not fresh verification.

## 1. What “done” means

A non-technical user can:

1. Upload an original CSV through a standard file chooser and preview its stored rows.
2. Select one or more **original input files** and choose one of three processing functions. Checked results are excluded from processing.
3. Process every row, retain invalid rows with clear reasons, and inspect the output.
4. Download results that preserve original source columns and append generated columns and the agreed ID fields.
5. Select **2–5 compatible processed results** and compare them, with an overview and row-level differences. The interview's two-file requirement is included in that range.
6. Identify original inputs and processed results by **File ID**, independently of file names, and archive/restore without altering their identity.
7. Re-run an existing function on an input only after a clear **Run & Replace** confirmation; cancellation must leave all affected files unchanged.

This is a demonstration with synthetic refrigerant-batch data, not a production engineering platform. It does not require authentication, a database, permanent cloud storage, sensor integration, or industrial control logic.

### Non-negotiable identity contract (authoritative)

- **File ID, filename, and processing function are separate fields.** Filename is user-supplied display metadata only. It must never be used for lookup, grouping, linking, collision detection, replacement, or comparison eligibility.
- Every newly uploaded **original input** gets a fresh six-digit base File ID (for example `101010`). Duplicate filenames and duplicate file contents are permitted; even re-uploading the same original creates a distinct base ID.
- A processed result uses its selected original's base ID and the function suffix: `101010-V` (Validation), `101010-M` (Mass Calculation), `101010-C` (Classification).
- Processing the same original with the same function again targets the **same full result ID**. Require explicit replacement confirmation; no extra run-specific file ID or automatic version is created.
- Different originals—even when named exactly the same—produce different result IDs.
- Results carry `file_id` (base/original ID) and `result_id` (full result ID) in their CSV data as currently planned. Keep the partner's filename separate from these column values.
- Preview, download, archive, restore and compare operations address stored artifacts by ID. **Renaming is not supported** (decided 2026-11-11); if it is added later as its own item, a rename must not change identity.
- **Imported processed-result lineage (decided 2026-11-11, built in 11.7):** an uploaded result always gets a new base ID plus its function code and is marked Imported. It is **linked** to an original only when its embedded source File ID names an original input in the workspace *and* its original input columns and values match that input exactly (generated columns excluded, column order ignored). Otherwise it keeps the embedded source ID as provenance but stays unlinked, and is never presented as linked.
- “Never reused” is guaranteed only within a persistent ID allocation namespace. Resetting demo storage may restart allocations; document this limitation unless an ID registry survives resets.

## 2. Frozen UI scope

### Main desktop screen

- **Left control column:** CSV upload/drop area; three processing functions; selected input filename; **Run Processing** button.

- **Right file workspace:** one-line “CSV Files” heading/subtitle; **separate File ID and Filename columns**; one filter card (since 9.7) with search, upload-date range, processing function and status (**All / Ready / Needs Review / Processing / Processed / Error**) filters and **Clear filters**; **Active Files** / **Archived** tabs with counts (since 9.3) and **Sort by** beside them (since 9.7); scrollable file table with File ID, filename, upload date (Archived On and Original Upload in the Archived tab), processing function (since 9.7), status and a ⋯ **Actions** menu (since 9.10; **Preview file** and **Download file**, plus **Restore file** in Archived); row and column counts appear in **Preview**, not the table (since 9.9).

- **Select files:** every row has a checkbox; a header checkbox selects all visible rows. **Run Processing** processes only the checked original inputs in turn with the chosen function; checked results are ignored by it (since 9.2, results are selectable so they can be archived). While rows are checked, a selection bar at the top of the table offers **Archive N files** (or **Restore N files** in the Archived tab) for the checked rows in view; archived rows also have a ⋯ menu with **Restore file**. Do **not** add compare buttons to each row.

- **Processing feedback:** the selected input row displays a spinner and **Processing…** while the request runs; if it fails, show **Error** and an actionable message. On success, keep the input available and add a **new processed result file** to the list.

- **Comparison start (since 9.4b):** no footer. Ticking 2–5 compatible results of one function shows **Compare N files** in the selection bar; otherwise the bar explains why it cannot run. Selection and comparisons use full File IDs, never filenames.

### Modals

- **CSV Preview modal:** filename, row/column count, scrollable or paginated row preview, original headers, close button. Avoid rendering enormous datasets all at once.

- **Processed Results modal:** opens after successful processing; table shows original columns **plus** generated result columns; download action.

- **Comparison workspace (2–5 files):** full-screen dialog opened from **Compare N files**, with compact file chips showing distinct IDs and short names; reference and metric controls; **Overview** and **Row Differences** tabs. Overview favors one graph and a concise per-file table. Avoid repeating the same counts in chips, KPI cards, table and top-difference cards. Row Differences has a filterable row matrix. Close button; no permanent graph or comparison footer on the main screen.

**Design constraint:** modern Apple-inspired simplicity: light neutral background, restrained blue/green accents, clear typography, generous whitespace, modest borders/shadows, and no unnecessary dashboard or navigation.

## 3. Repository layout

```text

icorium/

├── client/

│   └── src/

│       ├── App.tsx           # The one workspace screen

│       ├── api.ts            # Typed API client

│       ├── components/       # Sidebar, FileTable, CompareWorkspace, Modals

│       └── *.test.ts(x)      # Unit and component tests

├── server/

│   └── src/

│       ├── routes/files.ts   # Upload, list, rows, process, download, compare

│       ├── adapters/         # Partner A/B/C CSV mapping

│       ├── processing/       # Three independent functions and shared row validation

│       ├── lib/              # CSV parse/export, storage (local or private Blob), compare

│       └── *.test.ts         # Unit and API tests

├── shared/types.ts           # Common TypeScript types and the processor list

├── sample-data/              # Five synthetic partner CSVs

├── blueprint/                # Plan, stack, commit rules, feature records

└── README.md                 # Setup, tests, demo steps, limitations

```

A single repository and **one API** are sufficient. Avoid microservices, task queues, authentication, and a database for the first version.

## 4. Feature build order

Each numbered item is one work item: one branch, one reviewed scope, one small

PR. This replaces the phase checklist; the requirements elsewhere in this

plan still apply. IDs retain their original phase prefix for traceability.

### What to build next

**Next: 9.10** `feature/9.10-row-actions-menu` (added 2026-11-11), then 10.5 `chore/dead-and-partial-code`

and 10.6 to 10.12 in order. Start 9.10 with a component test that an Active Files row has one Actions menu button and no Preview button. **Order:**

10.1–10.3, then M11 (11.1–11.7, including 11.3a; 11.7 before 11.6), then 10.4–10.12; M11 changes how files are

identified and stored, so the P2 refactors build on it.

New work outside M10 and M11 needs a new request: add it as a new stable

ID with its scope before building, or use a `fix/` branch for a bug.

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

\| Former phase | Existing capability | Evidence/location |

\| --- | --- | --- |

\| 1 | Vite/React client, Fastify API, shared contracts, local sample data and startup commands | `package.json`, `client/`, `server/`, `shared/types.ts`, `sample-data/`, `README.md` |

\| 2 | Two-column workspace, file table, filters, selection, preview/results/comparison dialogs and fixed/collapsible comparison footer | `client/src/App.tsx`, `client/src/components/` |

\| 3 | Upload, schema detection, normalization, validation, file metadata and paginated preview | `server/src/adapters/`, `server/src/routes/files.ts`, `server/src/lib/`, core/API tests |

\| 4 | Validation, component mass and demo classification; every row retained; processing feedback and results preview | `server/src/processing/index.ts`, `shared/types.ts`, `client/src/App.tsx`; unified invalid-row behavior remains 8.1 |

\| 5 | CSV export preserving source headers/values, generated columns, escaping, preview/download and local storage | `server/src/lib/csv.ts`, `server/src/lib/storage.ts`, core/API tests |

\| 6 | Two compatible saved or re-uploaded results, schema-based detection, comparison metrics/graphs and readable errors | `server/src/lib/compare.ts`, routes, `client/src/components/Modals.tsx`, core/API tests |

\| 7 | Vitest unit/API tests and client type-check/build | `server/src/core.test.ts`, `server/src/api.test.ts`, `npm run verify` |

Result names remain `result_\<input name without .csv>_\<function id>.csv`.

Re-running the same function replaces that result. A result is recognized by

its columns even if renamed. Preserve all original rows, headers, cell strings

and column order; processors append generated columns only. Do not edit samples.

### M8 — Partial processing

**Principle:** never silently correct bad data or calculate misleading results.

Validate every row, process valid rows, and keep invalid rows with their reasons.

Block a whole file only when it is unreadable or cannot map to a partner schema.

\| Error type | Example | Required behavior |

\| --- | --- | --- |

\| File-level | Missing required columns, unsupported format, malformed CSV | Reject with a clear message; existing behavior |

\| Row-level | Missing mass, negative percentage, nonnumeric value, missing or duplicate batch ID | Keep the row and reason; skip its calculation |

\| Allowed input | Extra columns, composition within ±0.5 percentage points of 100% | Allow; do not add a noisy warning list for rounding |

- [x] **8.1** `feature/8.1-shared-row-validation` — Use the same Composition Validation rules for all three functions, including missing and duplicate batch IDs. End every result with `processing_status` (`Valid` / `Invalid`) and `validation_errors` (empty when valid), replacing `validation_status`, `validation_message` and `mass_status`. Validation retains `composition_total_pct`; invalid mass rows have empty calculated values and invalid classification rows use `Needs review`. Update result detection and comparison so newly exported or renamed/re-uploaded results work in this same PR.

  **Result:** merged in PR #3 (`7a8ac14`); automated verification passed. See [feature scope and results](history/features/8.1-shared-row-validation.md).

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

  **Result:** merged in PR #4 (`6f08728`); automated verification passed (96 server tests, 13 client unit/component tests and client build on 2026-11-06). Person confirmed filters work and removed remaining manual UI acceptance gates. See [scope and verification status](history/features/8.2-needs-review-status.md).

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

  **Result:** merged in PR #13 (`9425c11`); automated verification passed (2026-11-09). See [feature scope and results](history/features/8.3-data-quality-warning.md).

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

  **Result:** merged in PR #14 (`0b87809`); automated verification passed (2026-11-09). The API contract test pins every sample's invalid rows and reasons for all three functions. See [feature scope and results](history/features/8.4-partial-processing-demo.md).

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

  **Result:** merged in PR #19 (`7d1f474`); automated verification and CI passed (2026-11-09).

  **Done when:** tabs show correct counts and switch by click and arrow keys; the selection bar appears only with selected rows in view and clears them; bulk archive, bulk restore, menu restore and Undo call the API with the right ids and report success or failure; archived rows sort by archive time; the Status filter no longer offers Archived; 9.2's processing and compare exclusions still hold.

  **Verification:** API test for `archivedAt` set and cleared; component tests for tabs, counts, keyboard, selection bar, toast and Undo, auto-hide, row menu (mouse and keyboard), sorting and columns, failures, empty state, double click and exclusions; `npm run verify`.

- [x] **9.4a** `feature/9.4a-multi-file-compare-api` — Compare 2 to 5 results at once instead of exactly two, at the person's request on 2026-11-09 (they supplied a multi-file comparison concept and chose to remove the compare footer). `GET /api/compare?ids=a,b,c` replaces `?a=&b=`. It returns `files` (name, partner, rows, problems), `rowMatch`, the matched `rows`, and per column a `summary` per file (total for kg, mean otherwise), `categories` with counts per file, and `values[row][file]`. Rows are matched by batch ID when every pair of files shares at least one ID (a partner's baseline and follow-up); otherwise by position, which is what files from different partners always get. Repeated IDs match occurrence by occurrence; blank IDs never match. The existing modal reads the new shape (any number of files, Δ only for two) until 9.4b replaces it.

  **Result:** merged in PR #20 (`a9f75a0`); automated verification and CI passed (2026-11-09).

  **Done when:** 2–5 different results of one function and output schema compare; fewer, more, repeated, input or mixed-function selections are refused in plain words; per-file summaries, categories and values follow the matched rows; matching by ID or position follows the rule above.

  **Verification:** unit tests for summaries, categories, padding, ID matching (reordered, repeated, blank, partial overlap) and fallback; API tests for 2- and 5-file comparisons of the samples, batch-ID and position matching, limits and errors; `npm run verify`.

- [x] **9.4b** `feature/9.4b-compare-workspace` — Remove the fixed compare footer. Ticking 2–5 results of one function in Active Files shows **Compare N files** in the selection bar (disabled, with the reason, otherwise). It opens a full-screen comparison workspace: file cards (short partner label, colour, flagged rows), a compare-metric choice, **Overview** (per-file bar chart and summary table with **Δ vs ref.** in pp or kg and a **Reference** file picker) and **Row details** (a line per file, deviation from 100% for composition totals, grouped horizontal bars for categories), stating how rows were matched.

  **Result:** merged in PR #21 (`3d3d4d0`); automated verification and CI passed (2026-11-09). Its layout is replaced by the 9.5 dashboard. After a clean batch of 2+ files the new results are left selected, ready to compare. Row details also lists every matched row (with an "Only rows that differ" filter) and highlights cells that differ from the reference file; the Archived tab offers no Compare.

  **Depends on:** 9.4a.

  **Done when:** the footer is gone; selection-bar compare enables only for valid selections; the workspace shows every file with a consistent colour, switches metric, view and reference, and reports failures; phone width has no sideways page scroll.

  **Verification:** unit tests for Δ vs reference and labels; component tests for the selection-bar compare, workspace controls, keyboard use and errors; `npm run verify`.

- [x] **9.5** `feature/9.5-compare-dashboard` — Rework the comparison workspace as a dashboard, at the person's request on 2026-11-09 after reviewing 9.4b (they supplied a mockup; Export was left out). Selected files become chips with a tick or warning for flagged rows. Reference file, metric pills and an **Overview** / **Row differences** switch share one row. Overview puts a row chart (one line per file, axis fitted to the data, optional deviation from 100%) or, for categories, horizontal grouped bars and a count table beside **Summary by file** (mean or total, Δ vs reference, flagged rows; rows differing from the reference for categories). Below, **Comparison at a glance** shows the reference file, rows differing and flagged files, and **Top differences** lists the 3 rows that differ most from the reference for the metric (largest gap first; rows differing only by a missing value or row after; categories in row order) with **View all row details**. Row differences opens filtered to differing rows. The row-matching note stays; labels stay **Partner A · Baseline**. No API change.

  **Result:** merged in PR #22 (`dc210fb`); automated verification and CI passed (2026-11-09).

  **Done when:** the dashboard shows chips, controls, chart, summary, at-a-glance figures and top differences for numeric and category metrics; changing the reference updates Δ, highlights and top differences; View all row details opens the filtered row differences.

  **Verification:** unit tests for top-difference ranking (gaps, missing values and rows, reference changes, categories, none) and the fitted axis; component tests for the dashboard, category metric, reference change, deviation toggle and row differences; `npm run verify`.

- [x] **9.6** `feature/9.6-csv-generator` — A CSV generator page at `/generator`, at the person's request on 2026-11-09, to make more synthetic partner CSVs. The person chooses Partner A, B or C, 1–5,000 rows, 1–10 files (added the same day at their request, with no two files having the same data), and no errors or a number of rows with errors per file. `POST /api/generate` (`partner`, `rows`, `errorRows`, `files`, optional `seed`) returns `{ files }` in that partner's own columns and units with their planted errors, and saves nothing; each file gets its own seed and a file matching another is regenerated. Files are named `partnerA-MMDDYYYY-001.csv`, `-002`, … (the person's naming; numbering restarts per batch). The page lists the files with editable names, previews any file's first 10 rows and planted errors, and offers **Download** per file (through the browser) and **Add all to CSV Files** (the normal upload, reporting each failure). Clean rows always pass Composition Validation; with errors, exactly the requested number of rows fail it (missing or non-numeric mass, negative R-125, composition total 15 points short, missing batch ID, or a duplicate batch ID, which always marks two rows). Batch IDs and dates follow the samples. Links join the two pages; `Root` in `App.tsx` picks the page from the URL, with no router library.

  **Result:** merged in PR #23 (`3433e63`); automated verification and CI passed (2026-11-09).

  **Done when:** each partner's generated file is recognised by its adapter and uploads like a sample; clean files have no problem rows; with errors, the flagged rows and reasons match the planted ones exactly; files in a batch never share their data and follow the naming; invalid requests are refused in plain words; the page generates, previews, downloads and adds files and reports failures.

  **Verification:** unit tests for formats, units, IDs, dates, exact error counts and reasons across partners and seeds, every error kind, file names, distinct files in a batch, seeds and limits; API tests for the endpoint, no saving, several files, no repeats across requests, upload round trip and validation; component tests for the page and routing; `npm run verify`.

- [x] **9.7** `feature/9.7-processing-function-column` — Add a **Processing function** column before **Status** in the file table, in both tabs, at the person's request on 2026-11-09 (from their screenshot). Inputs read **Original**; results read **Validation**, **Mass Calculation** or **Classification**, from the stored `processor`. Small grey text, as in the screenshot. At their follow-up requests, a **Processing Function** filter (All functions / Original / Validation / Mass Calculation / Classification) was added, then the filter bar and tabs were restyled from their mockup: search, Date Range, Processing Function and Status share one card, each with its label above its value, ending in **Clear filters** (disabled until a filter is set); the tabs briefly became pills with count badges but were returned to the underline style at the person's request; and **Sort by** at the right of the tabs offers Uploaded (newest), the new default for Active Files, Uploaded (oldest), Name (A–Z) and Name (Z–A), plus Archived (newest), the Archived tab's default. Each tab keeps its own sort, and the sorted column header shows an arrow and `aria-sort`. Open dropdown lists get inside padding on their options: a plain rule for Firefox, and for the filter and Sort by dropdowns (class `menu-select`) Chrome and Edge's customizable select (`appearance: base-select`), which styles the open list as a padded, rounded panel; browsers without it keep the native list. No API change.

  **Result:** merged in PR #24 (`3ffd992`); automated verification and CI passed (2026-11-10).

  **Done when:** every row shows the right label in Active Files and Archived, next to Status; the filter shows only the chosen function's files in either tab, combines with the other filters and clears with them; Clear filters is disabled with no filter set; each sort orders the list as named, per tab, and marks its column.

  **Verification:** unit test for the label rule (inputs, each function, unknown function); unit test for each sort order; component tests for the column and labels in both tabs, the filter (each choice, combined with status, Clear filters, Archived tab), the filter card and Clear filters, and sorting in both tabs with header `aria-sort`; `npm run verify`.

- [x] **9.8** `feature/9.8-architecture-page` — An **Architecture & Tech Stack** page at `/architecture` for explaining the engineering decisions in the interview, at the person's request on 2026-11-10 (their brief was cut off in its last section; the final bullet was completed as monitoring and logging). Sections: engineering overview and guiding principle; a card per technology (role, reasons, one trade-off, files); an interactive diagram (select a component to see what it does and which files implement it; follow the Upload, Process, Compare or Generate request step by step); the main decisions (React + Fastify vs Next.js, TypeScript, file storage vs PostgreSQL, the modular pipeline, synchronous processing); storage and deployment, separating hosting from storage, with S3/R2 shown as a possible future backend that is not built and Vercel described as configured but not deployed; a trade-offs table; and what would evolve as the product scales. Linked from the file workspace and the generator. No new dependencies; no API change.

  **Result:** merged in PR #25 (`38bd5b6`); automated verification passed (2026-11-10).

  **Done when:** every section renders; the diagram's components and flows are selectable by mouse and keyboard and name real files; every path, package, card version and quoted limit matches the code; the page is reachable from the other pages.

  **Verification:** content test reading the repository (paths, packages, versions, flows, quoted limits and deployment status); component tests for sections, cards, diagram selection and flows, storage and trade-offs, and navigation; `npm run verify`.

- [x] **9.9** `feature/9.9-compact-file-table` · **P2** — Remove the **Rows** and **Columns** columns from the file table in both the **Active Files** and **Archived** tabs, at the person's request on 2026-11-11 (they supplied a compact mockup; it is illustrative, and the Uploaded date stays). Presentation only.

  - Table columns, in order: selection checkbox, **File ID**, **File Name**, **Uploaded** (Active) or **Archived On** and **Original Upload** (Archived, unchanged), **Processing function**, **Status**, **Actions**. Rebalance widths so **File Name** gets the freed space; the table keeps scrolling inside its own region at phone width with no sideways page scroll.

  - The **Preview** header shows, compactly in the existing subtitle and without new cards: filename (title), File ID, total rows, total columns and, for results, the processing function. Today an input shows rows and columns but a result shows only rows.

  - Unchanged: upload, processing, File IDs, archive and restore, 2–5 file comparison, selection and bulk actions, filters and sorting, downloads, API responses and stored metadata (`rows` and `columns` stay in `FileMeta`).

  **Depends on:** 11.5.

  **Done when:** neither tab has Rows or Columns headers or cells; File ID stays its own column; File Name is wider; the preview of an input and of a result both show File ID, row count and column count, and a result also its function; every existing file operation still works.

  **Verification:** component tests for both tabs' headers and cells, the empty-state colspan, and the preview header for an input and a result; existing table, selection, sort and archive tests updated where they relied on the removed columns; `npm run verify`.

- [x] **9.10** `feature/9.10-row-actions-menu` · **P2** — Replace the **Preview** and download buttons on each Active Files row with the same ⋯ **Actions** menu the Archived tab already uses, at the person's request on 2026-11-11 (the 9.9 mockup). The Active menu holds **Preview file** and **Download file**; the Archived menu keeps **Preview file**, **Download file** and **Restore file**. Archiving stays in the selection bar. Presentation only.

  - Reuse `RowMenu` in `client/src/components/FileTable.tsx` (its keyboard behaviour: Enter/Space opens, arrow keys move, Escape or a click outside closes and returns focus to the trigger), with Restore shown only in Archived. The trigger keeps the ID-bearing label `Actions for <File ID> <filename>`; the Actions column is centred in both tabs.

  - Opening the menu never selects the row; Preview opens the existing preview modal and Download uses the existing download link.

  - Unchanged: selection, bulk Archive / Restore / Compare, processing, filters, sorting, downloads and the API.

  **Depends on:** 9.9.

  **Done when:** every Active Files row shows one ⋯ button and no Preview or download button; its menu offers Preview file and Download file only and both work; the Archived menu is unchanged; the menu works by keyboard and never toggles the row's selection.

  **Verification:** component tests for both tabs' menus (items, preview opens, download link by File ID, no row selection, keyboard open/move/close and focus return); existing tests that clicked the Preview or download buttons updated; `npm run verify`.

### M10 — Code review fixes

From a full read-only review of the code on 2026-11-10 (after 9.8), covering

SOLID, DRY, performance, abstractions, race conditions, deadlocks, anti-patterns,

partly implemented and dead code, and hard-coded values. The person asked for

every finding to be planned. Items are in priority order; the selection rule

above applies. **P1** items are user-visible bugs; **P2** items are code health

and performance that matter only as usage grows or the Vercel deployment goes

ahead. No deadlocks were found (nothing takes locks), and no path traversal or

injection: files are stored under generated IDs and the upload name never

reaches a path. If an item changes a route, limit, file or dependency named on

the Architecture page, update the page in the same item (see `CLAUDE.md`).

- [x] **10.1** `fix/download-file-names` · **P1** — Downloading a file whose name has characters outside Latin-1 returns **500 `ERR_INVALID_CHAR`**: `/api/files/:id/download` puts the raw name in `Content-Disposition` (`server/src/routes/files.ts`). Confirmed by uploading `報告.csv` (200) and downloading it (500). Send an ASCII fallback `filename="…"` plus an RFC 5987 `filename*=UTF-8''…` so any upload name downloads.

  **Result:** merged in PR #28 (`b36e76a`); automated verification and CI passed (2026-11-11). An `attachment()` helper in `server/src/routes/files.ts` writes `filename="\<ASCII fallback>"` (accents dropped, other characters, quotes and backslashes replaced with `_`) and `filename*=UTF-8''\<percent-encoded name>`, also encoding `! ' ( ) *`.

  **Depends on:** none.

  **Done when:** files named with CJK, accented and quoted characters all download with status 200 and their original name in `filename*`; existing download tests still pass.

  **Verification:** API tests for those names; `npm run verify`.

- [x] **10.2** `fix/read-only-file-list` · **P1** — `GET /api/files` writes: it backfills missing problem counts and reconciles old statuses with `storage.patch` while listing (`server/src/routes/files.ts`). A read with side effects is an anti-pattern, and on Vercel Blob two tabs loading together can make one list request fail with a 409 from the ETag check. Move the reconciliation to a one-off step at startup (beside sample seeding), and make the list purely a read.

  **Result:** merged in PR #29 (`e98f906`); automated verification and CI passed (2026-11-11). `GET /api/files` now returns `storage.list()` only. `reconcileMetadata()` in `server/src/lib/storage.ts` runs once in `buildApp` after seeding: it fills in missing counts (reading only those files), sets input statuses, treats a 409 as another server having done it, and skips (and the app logs) a file whose CSV cannot be read, so startup never fails on one bad file.

  **Depends on:** none.

  **Done when:** listing never writes; files saved before counts or the Needs Review status existed are still corrected, once, at startup; concurrent list requests cannot fail.

  **Verification:** API tests for startup reconciliation and that a list makes no writes (the existing "reconciles old statuses" and restart tests move to the startup step); a Blob storage test with two concurrent lists; `npm run verify`.

- [x] **10.3** `fix/client-request-races` · **P1** — Client requests that can apply out of order or silently do nothing:

  - `refresh()` in `client/src/App.tsx` has no ordering guard, and the upload's refresh is not awaited, so an older file list can overwrite a newer one (for example an upload finishing during a processing batch). Ignore responses from superseded requests.

  - The preview's first page fetch in `PreviewModal` is never cancelled, so a slow response can land after the preview closes or changes file.

  - **Undo** on the archive toast is silently ignored while a processing batch runs, because it shares the busy flag. Disable it with a reason, or queue it.

  **Result:** merged in PR #30 (`0085eb5`); automated verification and CI passed (2026-11-11). `refresh()` in `App.tsx` numbers each list request and applies only the latest answer or error, and the upload awaits its refresh. `PreviewModal` ignores first-page and "Show more" responses for a file that is no longer open. Undo on the archive toast is disabled during a processing batch with "Available when processing finishes". The five new component tests fail against the previous code.

  **Depends on:** none.

  **Done when:** a stale list or preview response never replaces newer data; Undo is never a silent no-op.

  **Verification:** component tests with deferred promises resolving out of order for the list and the preview, and for Undo during processing; `npm run verify`.

- [x] **10.4** `fix/comparison-and-dialog-edge-cases` · **P2** (after M11) — Small correctness gaps:

  - Comparison row keys are built as `B-010 (2)` and `(blank ID) file 1 row 3` (`server/src/lib/compare.ts`), which can collide with a real batch ID of the same text. Keep the display label but key rows on something that cannot collide.

  - "Rows differing" compares cell text, so `100` and `100.0` count as different. Compare numeric columns by value.

  - The generator's retry loop for distinct files (`generateFiles` in `server/src/lib/generate.ts`) has no attempt cap. Stop with a clear error after a fixed number of attempts.

  - The dialog focus trap (`FOCUSABLE` in `client/src/components/Modals.tsx`) includes disabled `select`/`input` elements.

  **Depends on:** none.

  **Done when:** each case behaves as described and is pinned by a test.

  **Verification:** unit tests for key collisions, numeric equality and the retry cap; a component test for Tab past a disabled field; `npm run verify`.

- [x] **10.5** `chore/dead-and-partial-code` · **P2** — Remove or finish half-done code:

  - The preview highlights cells equal to `ERROR` in red (`Modals.tsx`); only legacy exports contain that, and current results write `Invalid`. Highlight `Invalid` status cells (keeping legacy `ERROR`), or drop the rule.

  - `detectProcessor` (`server/src/processing/index.ts`) exists only for tests; use `detectResult` there and delete it.

  - The public `/api/generate` accepts a test-only `seed`. Keep generation deterministic in tests through `generateFiles` directly or an injected random source, and drop `seed` from the API (update the API tests).

  - Delete the duplicated doc comment above `Modal`; stop exporting symbols nothing imports (`Adapter`, `TopDifference`, `fmtDate`, `FILE_COLORS`, `DEMO_CLASS_RULES`) unless a test needs them; rename `archiveTargets` in `App.tsx` (it also drives Compare) to `selectedInView`.

  **Depends on:** none.

  **Done when:** none of the above remains; behaviour is unchanged apart from the chosen highlight.

  **Verification:** updated unit/API/component tests; `npm run verify`.

- [x] **10.6** `refactor/single-source-names-and-limits` · **P2** — DRY: each fact defined once.

  - Processing function ids and names live in three places: `PROCESSORS` (`shared/types.ts`), the Zod enum in `server/src/routes/files.ts` and `FUNCTION_LABEL` in `client/src/components/FileTable.tsx`. Derive the enum from `PROCESSORS`, add the table label there, and filter the file list by processor id instead of by display label.

  - Generator limits are repeated in `GeneratorPage.tsx`; move `GENERATOR_MAX_ROWS`/`GENERATOR_MAX_FILES` to `shared/types.ts` beside `COMPARE_MAX`.

  - Status filter options are hard-coded in `App.tsx`; build them from one list.

  - The three POST-JSON calls in `client/src/api.ts` repeat the same boilerplate; add one helper.

  - Generator inputs are validated twice with different messages (Zod and `generateCsv`); keep one set of messages.

  - Update the `CLAUDE.md` "Extending" steps to match.

  **Depends on:** 10.5 (touches the same files).

  **Done when:** adding a processing function or changing a limit needs one edit to names and limits; behaviour and messages are unchanged.

  **Verification:** existing tests unchanged in behaviour; a unit test that the API enum matches `PROCESSORS`; `npm run verify`.

- [ ] **10.7** `refactor/partner-adapter-formats` · **P2** — The generator finds an adapter by its display name (`` `Partner ${partner}` `` in `server/src/lib/generate.ts`) and keeps number formats in a separate `DIGITS` table, so a new partner needs three edits. Give each adapter an `id` (`A`/`B`/`C`) and its number formats, derive `GENERATOR_PARTNERS` from the adapters, and drop `DIGITS`. Update `CLAUDE.md`, the README and the Architecture page where they describe adding a partner.

  **Depends on:** 10.6.

  **Done when:** adding a partner (columns, units, formats) is one adapter entry, and the generator offers it.

  **Verification:** generator unit tests unchanged in output; a test that every adapter is generatable; `npm run verify` (the Architecture content test must still pass).

- [ ] **10.8** `refactor/client-structure` · **P2** — Logic at the wrong level:

  - `client/src/components/FileTable.tsx` exports file rules (`displayStatus`, `qualityWarning`, `processingFunction`, `sortFiles`, `SORT_OPTIONS`) and `FileTabs` alongside the table. Move the rules into `client/src/file-status.ts`, which `file-status.test.ts` already tests.

  - `App.tsx` (about 390 lines) holds state for filters, selection, processing, archiving, the toast and comparison. Extract hooks (for example `useFileList`, `useFilters`, `useArchive`) so each concern can be read and tested on its own.

  **Depends on:** 10.3 and 10.5 (same files; do the fixes first).

  **Done when:** no behaviour change; the component tests pass unchanged apart from imports.

  **Verification:** existing component tests; unit tests for any extracted hook logic; `npm run verify`.

- [ ] **10.9** `refactor/storage-interface` · **P2** — Leaky storage abstraction (`server/src/lib/storage.ts`, `blob-storage.ts`):

  - Local and Blob storage share no declared interface: one is synchronous, one asynchronous, and only Blob has `seed`, so `seedSamples` checks `'seed' in storage`. Declare one async `Storage` interface both implement, including seeding.

  - Local `get`/`list` return the live in-memory objects, so callers can change stored state; return copies.

  - `meta.json` is rewritten in place, so a crash mid-write corrupts it and the server will not start; write to a temporary file and rename.

  - Local storage uses synchronous `fs` calls inside request handlers, blocking the event loop; use `fs/promises`.

  - The module creates folders, reads `meta.json` and may throw on Vercel when imported; move this into an explicit initialisation called from `buildApp`, so tests no longer need environment variables set before importing.

  - Update the Architecture page's storage text if it changes.

  **Depends on:** 10.2 (startup reconciliation lives here) and 11.1 (storage is keyed by File ID).

  **Done when:** both backends satisfy one interface with no implementation checks outside storage; an interrupted metadata write cannot corrupt `meta.json`; importing the module has no side effects.

  **Verification:** storage unit tests run against both backends; an atomic-write test; existing API and Blob tests; `npm run verify`.

- [ ] **10.10** `perf/avoid-repeated-parsing` · **P2** — Every preview page (`GET /api/files/:id/rows`) re-reads and re-parses the whole CSV and re-validates every row to return 100 rows. Comparison normalizes each row once to match rows and again in `findProblems`. Cache the parsed rows and problem list per file id (invalidated when a file is saved or replaced), and reuse the normalized rows within one comparison.

  **Depends on:** 10.9.

  **Done when:** paging through a file parses it once; results are identical; a replaced result never serves cached rows.

  **Verification:** API tests that page results are unchanged and that a re-run result serves its new rows; a unit test that parsing runs once per file across pages; `npm run verify`.

- [ ] **10.11** `perf/blob-storage-lookups` · **P2, only if the Vercel deployment goes ahead** — With Vercel Blob, `find(id)` lists and downloads every record, CSV text included, one at a time, to find one file (`server/src/lib/blob-storage.ts`). Most routes call `get` then `read`, so a preview is two full scans and a five-file comparison ten; `patch` re-uploads the whole CSV to change a flag.

  - Load records in parallel.

  - Add one call that returns metadata and text together, and use it in routes.

  - Store metadata and CSV text as separate objects, so lists and patches never transfer CSVs.

  - Keep a small id → object index so a lookup needs no full scan.

  - Update `blueprint/vercel-deployment.md` and the Architecture page.

  **Depends on:** 10.9 and 11.1. With storage keyed by File ID, a lookup by id becomes a direct read, which replaces the planned id → object index.

  **Done when:** getting, reading or patching one file transfers only that file's objects; listing transfers metadata only; ETag conflict handling still returns 409.

  **Verification:** Blob storage unit tests counting SDK calls per operation; existing Blob tests; `npm run verify`.

- [ ] **10.12** `chore/configurable-server-settings` · **P2** — Hard-coded values that should be configurable:

  - Upload size limit (10 MB) and log level (`warn`) in `server/src/app.ts`, and the bind host `0.0.0.0` in `server/src/index.ts`: read `MAX_UPLOAD_MB`, `LOG_LEVEL` and `HOST` from the environment, with today's values as defaults.

  - `server/src/index.ts` uses `console.log`/`console.error`; use the app logger.

  - Keep as named constants, documented in one place: preview page cap (1,000 rows), Blob listing page size, toast duration (8 s), the generator's start date (2026-09-01) and value ranges, and the demo classification thresholds.

  - Document the variables in the README; keep the Architecture page's quoted 10 MB default true (its content test checks it).

  **Depends on:** none.

  **Done when:** each setting can be changed without editing code; defaults are unchanged.

  **Verification:** API tests for a custom upload limit and the default; the Architecture content test updated to read the default; `npm run verify`.

### M11 — File IDs

**Product contract agreed 2026-11-11:** IDs are the source of truth; filenames are not identifiers. This section overrides older historical references to filename-based replacement or output naming.

#### ID scheme

| Operation                      | File ID    | Link                                  |
| ------------------------------ | ---------- | ------------------------------------- |
| Upload `data.csv`              | `101010`   | New original                          |
| Run Validation on `101010`     | `101010-V` | Original `101010`                     |
| Run Mass on `101010`           | `101010-M` | Original `101010`                     |
| Run Classification on `101010` | `101010-C` | Original `101010`                     |
| Run Validation again           | `101010-V` | Confirmation, then replace same ID    |
| Re-upload `data.csv`           | `101011`   | New original, independent of `101010` |
| Run Validation on `101011`     | `101011-V` | Original `101011`                     |

The filename `data.csv` is permitted for every row above. A partner may name a file whatever they choose; the API must not derive lineage, processing function, or uniqueness from the name. Each stored artifact has a unique full File ID; original and result relationships derive from the base portion and suffix.

#### CSV and metadata representation

- Original stored CSV: retain source headers and values; append `file_id` containing its base ID on every data row.
- Processed stored CSV: retain original input columns (including `file_id`), then append `result_id` and function-generated fields. For example: `file_id=101010`, `result_id=101010-V`.
- Store `name`/`filename` independently in file metadata. Accept two different uploads with identical names. Changing the name does not modify the IDs or link.
- Processing uses the selected stored input ID and known processing function; it **never** guesses an ID or function by reading the filename.
- Results cannot be processed as inputs. Function codes remain fixed (`V`, `M`, `C`), with an extension point for future functions.

#### Replacement and archive

- Before a repeat run, inform the user which full result IDs would be overwritten. **Cancel** does nothing; **Run & Replace** replaces only those results.
- Enforce the rule server-side. New result creation must be atomic create-if-absent; confirmed overwrite must be explicitly authorized. A stale client or simultaneous request must not overwrite silently.
- Replacing an archived result returns the result to Active Files as already agreed, and the dialog must mention this.
- For multi-file processing, combine the duplicate-result warning with data-quality warnings into **one confirmation**. If the user cancels, send no processing requests.

#### Import behavior requiring explicit validation

- A new original upload always gets a new base ID, including when content and filename duplicate an earlier original.
- 11.2 treats uploaded processed CSVs as **Imported**, assigns a new full result ID and rewrites embedded IDs, with no link. **Decided 2026-11-11:** link only on a matching source ID *and* matching original data; otherwise keep provenance, unlinked (see 11.7).
- If older exports have no `file_id`/`result_id` columns, specify whether the importer adds them or supports them as a documented legacy exception. The current 11.2 result records a legacy exception, so the statement “every stored result carries IDs” is not yet unconditionally true.
- Sample files remain untouched on disk; ID columns are added only to stored copies.

#### Display requirements

- File table (Active and Archived): separate **File ID** and **Filename** columns, plus Processing Function and Status.
- File ID should be searchable. Searching a base ID such as `101010` may show the original and its suffixed results.
- Preview: show File ID separate from filename. Process panel: show selected original ID. Comparison: show both concise filename labels and distinct File IDs so duplicate names are unambiguous.
- Keep partner-provided filenames intact as labels. Generated result filenames may be descriptive but are never keys.

#### Persistence limitation

- Base IDs should be allocated without collisions across concurrent uploads within a persistent workspace.
- Archiving does not release an ID. A demo reset that deletes storage also deletes allocation history; do not promise no reuse across resets unless an independent registry is retained.

- [x] **11.1** `feature/11.1-file-ids` · **P1** — Assign and use File IDs.

  - Define each function's code once, on `PROCESSORS` in `shared/types.ts`, with the ID format (`^\d{6}$` base, `^\d{6}-[VMC]$` result) and a parser shared by client and server.

  - **Assigning a base ID:** next number after the highest base ID in use. Claim it with a create-if-absent storage write (local: in the same synchronous step; Blob: `put` with `allowOverwrite: false` on the ID's key) and take the next number on a conflict, so two uploads at once never share an ID.

  - **Storage is keyed by File ID** (local files and Blob objects named by ID). Result IDs come from the input's ID and the function's code; re-running replaces by result ID, not by name. This removes `replaceByName` and fixes a current bug: two different inputs with the same name overwrite each other's results.

  - Routes accept and validate File IDs. Results keep the display name `result_\<input>_\<function id>.csv`, as a label only.

  - Samples seed as `100001`–`100005` in name order. Document the reset in the README.

  - Update the `CLAUDE.md` "Result file names" rule to the File ID rules, the README and the Architecture page (storage keys, the Upload and Process flows); its content test must still pass.

  **Result:** merged in PR #31 (`fa493ff`); automated verification and CI passed (2026-11-11). `PROCESSORS` carries each code; `parseFileId`, `resultFileId` and `nextBaseId` in `shared/types.ts` are the shared rules. Both storage backends offer `create` (next base ID, or base plus code for an uploaded result), `put` (write at an exact ID; re-runs replace) and `seed` (fixed IDs, idempotent), and treat anything that is not a File ID as a 404 before touching storage. Blob stores files at `files/\<id>.json` (direct reads) and claims numbers at `claims/\<base>.json` with create-if-absent; old `records/` objects are ignored. Local storage refuses to start on pre-File-ID data with a message to delete `server/data` (never deleted automatically). `replaceByName` and the `'seed' in storage` check are gone. The uploaded-result ID (new base + code) is done here; marking it Imported is 11.2.

  **Depends on:** 10.1–10.3.

  **Done when:** every upload gets the next unused base ID, even under concurrent uploads; each result's ID is its input's ID plus the function code; a re-run replaces only that ID; two inputs with the same name keep separate results; no route or storage code looks files up by name.

  **Verification:** unit tests for the ID format, parser and next-number rule; storage tests for create-if-absent claims under concurrency on both backends; API tests for upload IDs, result IDs, replace by ID and the same-name case; `npm run verify`.

- [x] **11.2** `feature/11.2-file-id-columns` · **P1** — The ID travels with the data.

  - On upload, append `file_id` (the new base ID, every row). If the CSV already has `file_id` or `result_id` columns (a re-upload), rewrite their values to the new IDs rather than adding duplicates.

  - Processing keeps `file_id` as an original column and adds `result_id` as the first generated column of every function, so results read `…, file_id, result_id, \<function columns>, processing_status, validation_errors`.

  - Uploaded results get a new base ID plus their detected function's code and are marked Imported.

  - Update result detection, the comparison's schema check (so files are compared on function columns only), and leave `file_id`/`result_id` out of comparison metrics.

  - Partner adapters ignore the extra columns, so validation and processing results are unchanged.

  - Rename the "uploads and downloads unchanged" tests: a stored input now equals the upload plus `file_id`.

  **Result:** merged in PR #32 (`52edfb2`); automated verification and CI passed (2026-11-11). `stampFileIds` (processing) adds or rewrites `file_id` on inputs and rewrites `file_id`/`result_id` on uploaded results; results without ID columns (pre-11.2 exports) are stored exactly as uploaded. Every processor's generated columns start with `result_id`, which `processRows` fills in. `detectResult` also accepts results without `result_id`; the comparison leaves `result_id` out of its schema check and metrics, so older exports still compare with new results. Uploaded results get `imported: true`; samples are stored with their `file_id`. Storage `create` takes the text as a function of the new ID.

  **Depends on:** 11.1.

  **Done when (original 11.2 criteria):** stored originals and new processed results carry the ID columns; imported results follow the documented import rule (including the legacy-export exception); comparisons ignore ID columns; all other values are unchanged. **Follow-up required:** verify that re-imported processed results do not silently claim to preserve their original linkage after IDs are rewritten.

  **Verification:** API tests for upload, process, download and re-upload of inputs and results, Imported marking, and comparison of results with different IDs; core tests for detection with `result_id`; `npm run verify`.

- [x] **11.3** `feature/11.3-replace-requires-confirmation` · **P1** — The server refuses to overwrite a result unless asked. `POST /api/process` returns 409 with the existing result's ID and name when the result exists and `replace` is not `true`; with `replace: true` it overwrites and keeps the ID, returning an archived result to Active Files.

  **Result:** implemented; automated verification passed (2026-11-11), awaiting review and PR. `POST /api/process` takes an optional `replace` (default `false`). When the result ID already exists and `replace` is not `true`, it answers 409 with a `ReplaceConflict` (`shared/types.ts`): a message naming the input and the result ID, and `existing` with the result's `id`, `name` and `archived`, so 11.4 can say when it is archived. A refusal processes nothing and writes nothing. A confirmed re-run saves new metadata under the same ID, so an archived result returns to Active Files. KNOWN CORRECTNESS GAP: The existence check and write are not atomic; simultaneous first runs can overwrite the same result. Resolve before treating server-side non-overwrite protection as complete. API tests that use the shared samples confirm their re-runs; the client is unchanged, so until 11.4 a re-run in the app shows the 409 message as that file's error.

  **Depends on:** 11.1.

  **Done when (revised):** concurrent initial runs cannot overwrite one another silently; existing results require explicit `replace: true`; a 409 identifies the conflicting result; first creation needs no replacement flag. Confirm this with a concurrency regression test.

  **Verification:** API tests for first run, refused re-run, confirmed re-run (same ID, new content) and replacing an archived result; `npm run verify`.

- [x] **11.3a** `fix/11.3a-atomic-result-create` · **P1** — Close the documented race between “result does not exist” and creation. Make a new result write create-if-absent; if another run creates the same result first, return a replacement conflict instead of overwriting it. Preserve explicit replacement behavior. For a confirmed replacement, use available storage version/concurrency protection or document the overwrite semantics and prevent duplicate client submissions.

  **Depends on:** 11.3 implementation.

  **Done when:** two simultaneous first runs cannot silently overwrite one another, and an unconfirmed request never modifies an existing result.

  **Verification:** simultaneous creation/API and storage tests for local and Blob backends; replace and archived-result regressions; `npm run verify`.

- [x] **11.4** `feature/11.4-replace-confirmation-dialog` · **P1** — The confirmation in the UI, following the person's mockup: title **Replace existing result?**, "Composition Validation has already been run for file **101010**. Running it again will replace the existing result **101010-V**. This action cannot be undone.", **Cancel** and a red **Run & Replace**.

  - For several files, one dialog lists every result that would be replaced; files without an existing result are processed normally.

  - When the Data Quality Warning also applies, both appear in that one dialog.

  - It says when a result being replaced is archived.

  - The client checks selected input IDs and existing full result IDs before running; if the server still answers 409 (the list was stale), present the same confirmation for the conflict rather than silently retrying.

  - Cancel sends nothing; Run & Replace sends `replace: true` for exactly the listed files, once, even on a double click.

  **Depends on:** 11.3.

  **Done when:** no re-run starts without confirmation; Cancel changes nothing; one dialog covers replacements and data quality together.

  **Verification:** component tests for a single re-run, a mixed batch, a combined warning, Cancel, Run & Replace, a 409 from a stale list, keyboard use (focus, Escape) and double clicks; `npm run verify`.

- [x] **11.5** `feature/11.5-show-file-ids` · **P1** — Show **File ID and Filename as separate columns** in Active and Archived file tables. Search by either ID or filename; preview, comparison chips and processing selection show both independently. An **Imported** marker explains imported result files and missing original linkage. Sorting by File ID groups originals with suffixed results without relying on filename. Duplicate filenames must remain distinguishable by ID.

  **Depends on:** 11.1 and 11.2.

  **Done when:** ID and filename are displayed separately in file table and relevant views; duplicate filenames never cause ambiguous selection; searching `101010` finds the input and its results; renaming changes only the displayed filename.

  **Verification:** component tests for the column, search, sort, preview, comparison chips and Imported marker; `npm run verify`.

- [x] **11.7** `feature/11.7-link-imported-results` · **P1** — Link an imported result to its original only when both its identity and its data match. On upload of a result CSV, read the embedded source File ID (`file_id`, the same base ID on every row). The result is **linked** when that ID names an original input in the workspace (archived included) and the result's original input columns and values match that input exactly: compare the result's columns minus its generated processing columns (including `result_id`) with the stored input's columns, as the same set of column names regardless of order, with the same row count and the same value in every row for each column. A linked result records `sourceId` = the original's ID and keeps `file_id` = the original's base ID in its stored CSV. When the source ID is missing, inconsistent across rows, unknown, names a result, or the contents differ, the result **retains provenance** (the embedded source ID stored as `importedFrom` metadata, when there was one) but stays **unlinked**: no `sourceId`, `file_id` rewritten to the new base ID as today. Either way it gets a new base ID plus its function code and stays **Imported**; it never takes the original's result ID or replaces that result. Exports without ID columns keep the 11.2 legacy exception (stored unchanged, unlinked). The Imported marker and preview say "Imported from 101010" when linked, and "original input not linked" (naming the claimed source when there is one) otherwise.

  **Depends on:** 11.2 and 11.5.

  **Done when:** re-uploading an unchanged export of `101010-V` is stored as a new ID such as `101012-V` with `sourceId` `101010` and `file_id` `101010`; the same export with reordered original columns still links; an edited value, an added or removed row or original column, a missing, mixed or unknown `file_id`, or a `file_id` naming a result leaves it unlinked with `importedFrom` kept where present; re-run replacement and Sort by File ID are unchanged; the UI never shows an unlinked result as linked.

  **Verification:** server unit tests for the match rule; API tests for each linked and unlinked case, archived originals and legacy exports; component tests for the marker and preview wording; `npm run verify`.

- [x] **11.6** `test/11.6-file-identity-regression` · **P1** — End-to-end identity regression: upload two CSVs with the same filename and independent contents, verify unique base IDs, run the same function on each, verify separate results, cancel a repeat run, then confirm replacement of only one result. Repeat with archiving, restoring, downloading, re-uploading and 2–5 file comparison. Verify every lookup and action is keyed by full ID. Renaming is not supported, so it is not covered. Imported lineage acceptance case: the 11.7 rule (linked only on matching source ID and data; otherwise provenance kept, unlinked).

  **Depends on:** 11.3a, 11.4, 11.5 and 11.7.

  **Done when:** duplicate names never collide; one original's re-run never replaces another original's result; the ID relationships are stable; imported results follow the 11.7 rule and are never misrepresented as linked; tests cover all three suffixes.

  **Verification:** server API/storage tests, client component tests, full `npm run verify`; manual demo optional, not an unperformed acceptance claim.

### M7 — Final interview readiness

- [x] **7.1** `feature/7.1-interview-readiness` — Review final interview documentation and automated verification after partial processing and any explicitly requested UI changes. This is an integration review, not a redesign.

  **Result:** merged in PR #15 (`d28064b`); automated verification passed (2026-11-09). Added client component coverage for upload, preview paging, compare footer and comparison. Aligned README, plan layout and stack doc with the code. See [feature scope and results](history/features/7.1-interview-readiness.md).

  **Depends on:** 8.1–8.4 and any subsequently approved UI feature affecting the demo.

  **Done when:** README setup and demo instructions match the implementation;

  unit/API and component coverage supports the CSV workflow; known limitations are documented.

  No manual browser, keyboard, phone or alternate-browser checklist is required.

  **Verification:** `npm run verify` and documentation/code review. Do not

  describe unperformed browser checks as passed.

## 5. Minimal API outline (suggested, not prescribed)

\| Action | Example route | Result |

\| --- | --- | --- |

\| Upload CSV | `POST /api/files` | File ID + metadata |

\| List/filter files | `GET /api/files` | Files with status and counts |

\| Preview rows | `GET /api/files/:id/rows` | Headers + limited/pageable rows |

\| Run one function | `POST /api/process` | Result file ID + status |

\| Download CSV | `GET /api/files/:id/download` | Original or processed CSV |

\| Compare 2–5 results | `GET /api/compare?ids=\<id>,\<id>[,...]` | Per-file summaries, matched rows and chart data |

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

**P2 — Nice but nonessential:** additional pagination controls, richer visual polish and performance optimizations beyond the current dataset size. Some date-range and persistence behavior is already implemented; this priority list is not a statement that they are absent.

If time is limited, prioritize **working P0 functionality over appearance refinements**. The comparison dashboard should stay simple.

## 8. Suggested interview demo script

1. Open **Preview** on `partner_a_baseline.csv`: original columns, **Needs Review** status and the highlighted row 8 (`mass missing`).

2. Select its File ID, choose **Component Mass Calculation**, click **Run Processing**. The **Data Quality Warning** shows 24 valid / 1 invalid; click **Process Valid Rows**.

3. Show the row spinner (when visible), then the processed results modal.

4. Download the result CSV: original columns intact, generated columns appended, row 8 `Invalid` with its reason and blank masses.

5. Check both Partner A files and run the same function once; confirm the warning. Both results are left selected.

6. Click **Compare 2 files** and point out the file chips, the batch-ID row matching, the row chart, Δ vs the reference file, **Top differences** and the **Row differences** highlights.

7. Run **Composition Validation** to show it needs no confirmation, then explain how a fourth adapter or processing function would be added.

**Be ready to explain tradeoffs:** why TypeScript for both ends, why Fastify, why local CSV storage instead of a database, why comparison stops at five files, and how the code handles changing requirements.

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

**---**

**Scope guardrail:** The existing 2–5-file comparison workspace is approved; avoid adding *another* analytics dashboard, user accounts, databases, cloud deployment, AI recommendations, or complex industrial process models unless a new requirement justifies them.
