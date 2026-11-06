# Reclaim Studio — Build Plan

**Project:** Icorium full-stack coding exercise  
**Goal:** Deliver the complete CSV workflow in one straightforward application, using the agreed Apple-inspired two-column UI.  
**Stack:** React + TypeScript + Vite + Tailwind CSS + Lucide React; Node.js + Fastify + TypeScript; Papa Parse; Zod; Recharts; Vitest; local file storage.  
**Status:** Planning document — implementation is not yet complete.

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

## 4. Implementation phases

### Phase 1 — Set up project and sample data

**Build**
- [ ] Create Vite React/TypeScript client and Fastify/TypeScript server.
- [ ] Add Tailwind, Lucide, Papa Parse, Zod, Recharts, and Vitest.
- [ ] Configure local client-to-API development requests and a shared TypeScript data contract.
- [ ] Copy the five synthetic partner CSVs into `sample-data/`.
- [ ] Add concise startup commands and configuration notes to the README.

**Done when:** both apps start locally on Windows/macOS-compatible Node.js commands, with no database or cloud account required.

### Phase 2 — Implement the finalized UI as a static shell

**Build**
- [ ] Lay out the left controls, file table, filters, and fixed comparison footer.
- [ ] Add the CSV Preview, Processed Results, and Comparison modals.
- [ ] Support selected-row highlighting and disabled button states.
- [ ] Make the table body scroll within the available desktop height while the comparison footer remains fixed.
- [ ] Check narrow-screen behavior and keyboard/focus access to dialogs and controls.

**Done when:** the interface visually matches the approved mockup with representative fixture content, without adding extra screens.

### Phase 3 — Import, normalize, validate, and preview CSVs

**Build**
- [ ] API accepts **one CSV per upload action** using the browser's normal file selector (users can upload more files over time).
- [ ] Parse headers and rows; preserve the **unchanged original columns and original cell strings**.
- [ ] Detect the fictional partner schema and normalize IDs, dates, units, and three refrigerant percentages.
- [ ] Validate missing values, nonnumeric values, composition totals, duplicates, and unsupported headers; do not silently replace invalid values with zero.
- [ ] Store source CSVs locally, plus a small metadata index (filename, ID, upload time, row/column counts, status, source type).
- [ ] Provide list/search/date/status filters and a paginated or limited preview through the API.

**Done when:** all five example CSVs upload and preview, and the intentional malformed rows are flagged with understandable messages. Original data remains available for export.

### Phase 4 — Three processing functions and results preview

**Build**
- [ ] **Composition Validation:** append validation status and issues for each row.
- [ ] **Component Mass Calculation:** append `r32_mass_kg`, `r125_mass_kg`, and `r134a_mass_kg` from normalized total mass and composition; leave derived numeric values blank/invalid where inputs are unusable.
- [ ] **Batch Classification:** append a simple category based on documented, **demo-only** composition rules; do not suggest it is Icorium's actual operating policy.
- [ ] Keep each function in its own module with a consistent interface.
- [ ] Process **every row** (including invalid rows, which receive an explicit error/result state).
- [ ] On **Run Processing**, show the selected source row as **Processing…**, then create a new result entry and open the results modal. Surface errors visibly.

**Done when:** each selectable function processes every row of at least one sample file, and the corresponding result columns appear in the modal.

### Phase 5 — Export processed CSVs

**Build**
- [ ] Generate a **new CSV file** for each processing run.
- [ ] Preserve every original input header and cell value, in original order; **append** new result columns without overwriting the originals.
- [ ] Support CSV escaping for commas, quotes, and line breaks.
- [ ] Let users download a processed result and preview it again from the file list.
- [ ] Keep processed output in local file storage with its function name, source file ID, and creation time.

**Done when:** a downloaded output opens as CSV, has the same number of data rows as its source, includes all original columns unchanged, and includes the correct new columns.

### Phase 6 — Compare two saved result files

**Build**
- [ ] Populate footer **File A** / **File B** dropdowns with previously generated result files.
- [ ] Let users import two saved result CSVs from disk too, so comparison **does not depend on the current app session**.
- [ ] Enforce two distinct files and validate compatible processing-result schemas before comparing.
- [ ] Display a graph and a small summary table inside the **Comparison** modal.
- [ ] For mass-calculation outputs, compare average or total calculated component masses **using explicitly labeled units and aggregation**. For other functions, show a compatible metric (e.g., validation counts or classification distribution). Do not compare unrelated metrics as if equivalent.
- [ ] If files cannot be compared, show a plain-language explanation rather than an empty graph.

**Done when:** two previously exported CSVs can be loaded and the modal clearly shows at least one genuine difference between them.

### Phase 7 — Test and polish

**Automated tests (Vitest)**
- [ ] Partner A/B/C headers and unit conversions (kg, lb, g; percentage vs fraction).
- [ ] Missing, invalid, negative, duplicate, and inconsistent-composition rows.
- [ ] Exactly the selected function runs against **all** rows; unchanged source fields.
- [ ] Output row count, column preservation, formatting, and CSV escaping.
- [ ] Comparison calculations, file compatibility, and error messages.

**Manual checks**
- [ ] Upload each sample CSV using a normal file chooser.
- [ ] Preview large-enough files without overflowing the page.
- [ ] Run all three functions; observe spinner, success, and failure states.
- [ ] Download a result, reopen it, and confirm source + generated columns.
- [ ] Select two saved result CSVs and inspect the comparison graph.
- [ ] Search by filename and filter by date and status.
- [ ] Confirm keyboard use and modal close/focus behavior.
- [ ] Test on the intended interview computer/browser, plus one alternate browser if possible.

**Done when:** every item in the interview brief is demonstrated from the UI and basic failure cases do not crash the app.

### Phase 8 — Partial processing (planned, not built)

**Principle:** never silently correct bad data or produce misleading results. Validate automatically → flag errors → process valid rows → keep every row in the output. Only block a whole file when it is unreadable or cannot be mapped to a partner schema.

| Error type | Example | Behaviour |
| --- | --- | --- |
| File-level | Missing required columns, unsupported format, malformed CSV | Block (already built) |
| Row-level | Missing mass, negative percentage, non-numeric value, duplicate batch ID | Skip that row's calculation; keep the row with its reason |
| Warning | Extra columns, total within the ±0.5 % rounding tolerance | Allow (already allowed; no separate warning list, to avoid noise from rows at 99.99 %) |

| Function | Behaviour with invalid rows |
| --- | --- |
| Composition Validation | Analyse every row and report its errors (no warning step: finding problems is its job) |
| Component Mass Calculation | Calculate valid rows; invalid rows get empty mass values |
| Batch Classification | Classify valid rows; invalid rows get `Needs review` |

**Already in place:** file-level blocking, invalid rows kept with no made-up values, Validation runs on every row, problem rows listed per file in the list, preview and comparison.

**Build**
- [ ] Every result ends with the same two columns: `processing_status` (`Valid` / `Invalid`) and `validation_errors` (the reasons, empty when valid). They replace `validation_status`/`validation_message` and `mass_status`; Validation keeps `composition_total_pct`.
- [ ] Classification writes `Needs review` (not `Unclassifiable`) for invalid rows.
- [ ] One definition of "invalid" for all functions: the Composition Validation rules, including duplicate and missing batch IDs. A row tagged invalid is never also calculated.
- [ ] Input files with invalid rows show the status **Needs Review** instead of Ready, with an "N invalid" tag; result files keep **Processed** with the tag. Add Needs Review to the Status filter.
- [ ] **Data Quality Warning** dialog before Mass or Classification runs on files with invalid rows: per file, valid rows and rows with errors; text "Valid rows will be calculated. Invalid rows will remain in the output with error details and no calculated values."; buttons **Cancel** and **Process Valid Rows**.
- [ ] Update the result-file detection, README demo steps and tests (unit, API, browser) for the new columns, status and dialog.

**Done when:** for each sample file, Mass and Classification results have 24 (B follow-up: 23) `Valid` rows with calculated values and the planted rows `Invalid` with their reason; the warning dialog appears for those functions and not for Validation; Cancel processes nothing.

**Interview answer — "What happens when someone uploads a CSV with bad data?"** Unreadable or unmappable files are rejected with a clear message. Otherwise every row is checked; valid rows are processed, invalid rows stay in the output marked `Invalid` with the reason and no calculated values, and the user is warned before calculating on a file with problems.

## 5. Minimal API outline (suggested, not prescribed)

| Action | Example route | Result |
| --- | --- | --- |
| Upload CSV | `POST /api/files` | File ID + metadata |
| List/filter files | `GET /api/files` | Files with status and counts |
| Preview rows | `GET /api/files/:id/preview` | Headers + limited/pageable rows |
| Run one function | `POST /api/files/:id/process` | Result file ID + status |
| Download CSV | `GET /api/files/:id/download` | Original or processed CSV |
| Compare two results | `POST /api/compare` | Compatible comparison metrics/chart data |

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

## 9. Final acceptance checklist

- [ ] User selects/loads a CSV and views it inside the application.
- [ ] User chooses **one of three** processing functions.
- [ ] Selected function executes on **all rows**, and results are displayed.
- [ ] New CSV is saved with **all original columns plus generated columns**.
- [ ] User can **load two previously generated result CSVs** and compare them.
- [ ] At least one graph clearly helps identify differences.
- [ ] Every workflow is reachable in one app with normal file selectors, no code edits.
- [ ] Implementation demonstrates maintainability, frontend, backend logic, file handling, and visualization.
- [ ] Tests and README support a repeatable in-person demo.

---

**Scope guardrail:** Do not add a dashboard, user accounts, PostgreSQL/Convex, cloud deployment, AI recommendations, or complex industrial process models unless a new requirement justifies them.
