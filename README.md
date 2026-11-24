# Reclaim Studio

[![CI](https://github.com/lanestrin/icorium/actions/workflows/ci.yml/badge.svg)](https://github.com/lanestrin/icorium/actions/workflows/ci.yml)

Upload partner refrigerant CSVs, run one of three processing functions on every row, export results (original columns + generated columns), and compare 2 to 5 result files.

Interview exercise. All data is fictional and the classification rules are demo-only.

## Run

Requires Node.js 24 (the version CI uses).

```bash
npm install
npm run dev       # the app on http://localhost:5173 (Vite picks the next free port if 5173 is taken)
npm run verify    # every test + the production build
npm run storybook # the shared ui/ components in Storybook on http://localhost:6006 (npm run build-storybook for a static copy)
```

**Access.** The file workspace opens only for an active invited account or a guest demo; everyone else is sent to `/sign-in`. Admin, Architecture and Generator open only for an active Admin, or for an **Admin demo** (17.10): **Try Admin Demo** on the sign-in page starts a demo that also opens those pages, with fictional people and invitations kept in the tab and every Admin action simulated (nothing is sent to Supabase or emailed). A standard **Try Demo** is denied them. Without Supabase settings (a plain local checkout), the two demos are the only way in, so **Try Admin Demo** is the way to see those pages; `client/src/App.test.tsx` also covers a mocked Admin account. The access rule is `client/src/lib/access.ts`, applied by `client/src/components/layout/AccessGate.tsx`; it decides what is shown, and database policies and the Admin function protect the data (`supabase/README.md`).

**Where files are kept.** Processing runs in the browser. A signed-in account's files are kept in its private Supabase workspace (`client/src/lib/cloud-storage.ts`), which starts empty. A demo guest's uploads, results and archive flags are kept in that tab's own IndexedDB database (`client/src/lib/browser-storage.ts`), and nothing is sent to a server. They survive a refresh but are removed on sign-out or when the person clears their browser data. If the browser blocks IndexedDB, demo files are kept in memory until the page is refreshed, and the page says so. Files kept in a browser before sign-in was required are left as they are: **Export files kept in this browser** on the sign-in page, or **Export this browser's files** in the account menu, downloads them without changing, uploading or deleting them; anyone using that browser can do so. The five synthetic sample CSVs in `sample-data/` (described in `sample-data/README.txt`) are built into the page and loaded into the demo as File IDs `100001`–`100005`. To reset the demo, click **Clear my data** under the upload area and confirm: every upload and result in that demo is deleted and the five samples come back.

There is no server of ours: the app is a static site that any static host can serve. Accounts and their files use Supabase (status: Supabase deployed; validation in progress).

**File IDs.** Every file has a File ID. Each upload gets a new six-digit base ID, counting up from `100001` and never reused while the workspace exists. **Clear my data** starts a new workspace, so numbering starts again at `100006`; an old download that names a reused ID is linked again only if its data matches that input exactly. A result's ID is its input's ID plus its function's code: `-V` Validation, `-M` Mass, `-C` Classification, e.g. `101010-M`. Re-running a function on the same input replaces that result and keeps its ID, but only when confirmed: without `replace: true`, processing refuses and names the existing result. In the app, **Run Processing** first opens **Replace existing result?**, listing each result the run would replace (and saying when one is archived; replacing it returns it to Active Files), together with the Data Quality Warning when that also applies. **Cancel** changes nothing; **Run & Replace** sends `replace: true` for exactly the listed files. If the list was out of date and processing still refuses a file, the same dialog opens for it after the run. Uploading a downloaded result gives it a new base ID plus its code. Names are labels only, so two inputs with the same name keep separate results. Anything that is not a File ID is treated as an unknown file (404).

The File ID travels with the data. A stored input gets a `file_id` column with its ID on every row. A result keeps that `file_id` (so it names its original) and adds its own `result_id` as its first generated column. Downloads therefore carry their IDs. Uploading a file that already has these columns overwrites them with the new IDs (every upload is a new file); an uploaded result is marked as imported. Results exported before these columns existed are still recognised, stored unchanged and compared with new ones. Comparisons never compare `result_id`, since it always differs between files.

## Tests

| Level | File | What it proves |
| --- | --- | --- |
| Unit (Vitest) | `tests/core.test.ts` | Unit conversions, validation rules and tolerance, mass maths, classification thresholds, CSV escaping, comparison maths and row matching for 2–5 files, and the CSV generator (formats, exact error counts and reasons, file names, distinct files in a batch, seeds, limits) |
| Unit (Vitest, the real file service over memory storage, real sample CSVs) | `tests/file-actions.test.ts` | Every file action and error message, including archive and restore and CSV generation; all three functions on all five samples: exact invalid rows and reasons, every original column and value kept, download, renamed re-upload and compare; a regression check that all three functions on all five samples still produce, byte for byte, the results of release v2.4.1 (before universal ingestion; `tests/fixtures/sample-results/`); and a file identity regression for each function: same-named uploads, separate results, refused and confirmed re-runs, archive and restore, download, re-upload linking and 2- and 5-file comparison, all by full File ID |
| Unit (Vitest) | `tests/file-service.test.ts` | The file service called directly: each action's result, a refused and a confirmed re-run, and the 400 and 404 messages for bad input |
| Unit (Vitest) | `tests/release.test.ts`, `tests/pr-title.test.ts` | The release zip (allowlist, forbidden paths, credential scan, a deterministic build), the release workflow's static smoke test, and the PR title check |
| Unit (Vitest) | `client/src/lib/compare-view.test.ts` | When a selection can be compared, short file labels, metric names, Δ vs reference, number formats, top-difference ranking and the fitted chart axis |
| Component (Vitest + React Testing Library) | `client/src/pages/ArchitecturePage.test.tsx` | Architecture page sections and links, overview cards, technology tiles and their details (mouse and keyboard), the diagram and its numbered steps, the decisions and their full reasoning, storage options, evolution cards and section dividers |
| Unit (Vitest) | `client/src/pages/architecture-content.test.ts` | Every repository path, package, card version and quoted limit on the Architecture page exists in or matches the code |
| Component (Vitest + React Testing Library) | `client/src/pages/GeneratorPage.test.tsx` | Generator defaults, partner/rows/files/error choices, the file list, per-file preview and planted errors, download names, adding all files to CSV Files and partial failure, generate failure, double clicks and keyboard submit |
| Unit (Vitest) | `client/src/lib/file-status.test.ts` | Input eligibility, status precedence, when the Data Quality Warning appears and its per-file counts, and which results a run would replace (by File ID, archived included), and the list sort orders, including by File ID, and how the search, tab, status, function and date filters choose the files shown |
| Unit (Vitest + React Testing Library `renderHook`) | `client/src/hooks/hooks.test.ts` | Selecting and clearing files, keeping the newest file list when requests overlap, and the archive toast: its Undo, its 8-second timeout, a failed archive, and the lock shared with processing |
| Unit (Vitest, `fake-indexeddb`, real sample CSVs) | `client/src/lib/api.test.ts` | The browser API over the real file service: the five samples as 100001–100005, uploads and the 10 MB and `.csv` checks, a refused re-run carrying the existing result and a confirmed replace, row paging, downloads as CSV Blobs, archive, compare, generate, Clear my data restarting at 100006, and the memory fallback when IndexedDB is blocked |
| Unit (Vitest, `fake-indexeddb`) | `client/src/lib/browser-storage.test.ts` | The IndexedDB and memory storages against the same contract (new IDs and function codes, replace, create-only, patch, seeding, list order, 404s, clear), files kept after reopening, concurrent uploads getting different IDs, and the storage-full message |
| Unit (Vitest) | `client/src/lib/demo-admin.test.ts` | The Admin demo's fictional people and invitations: every simulated action following the real rules, list order, expiry, the 50-invitation cap, damaged or other-session data replaced, dates fixed from the first read, a failed save reported, and nothing written once the demo has ended |
| Unit (Vitest) | `client/src/lib/access.test.ts` | The access rule: every account state against the workspace and the Admin pages |
| Component (Vitest + React Testing Library, Supabase faked) | `client/src/App.test.tsx` | Which pages open at each address for each account (signed out, not set up, loading, demo, Member, Admin, no profile, inactive, failed read), denied pages never loading, losing access or switching accounts while a page is open, state kept through a token refresh, and the reload after the back/forward cache |
| Unit (Vitest, `fake-indexeddb`) | `client/src/lib/api-workspace.test.ts` | Which workspace the file actions open for each account state; that they start closed and never open or seed the older browser files |
| Unit (Vitest) | `client/src/lib/samples.test.ts` | The bundled samples are the five CSVs in `sample-data/`, byte for byte |
| Unit (Vitest, real SheetJS workbooks and the real file service; pdf.js and OCR faked) | `client/src/lib/ingestion-acceptance.test.ts` | One test for each of the 12 acceptance criteria of universal file ingestion: partner files unchanged, an unfamiliar CSV mapped, a later Excel sheet, a multi-page PDF, unknown and conflicting units, ambiguous OCR values, missing measurements, the same results as a partner file, every calculated value explained back to its source cell, comparison and File IDs, no bypass of the file service, and each supported file type with its failures |
| Component (Vitest + React Testing Library) | `client/src/pages/FilesPage.test.tsx` | Upload success and failure; selection and status/search/date filters; File ID and File Name columns, the Imported marker, search and sort by File ID, and IDs in the processing panel, preview and comparison chips; the processing function column, the filter card and Clear filters, sorting in each tab; archive tabs, selection bar, undo toast and the archived-row menu, including failures, double clicks and keyboard use; processing locks, failure and retry; warning dialog counts, cancel/confirm, focus and duplicate clicks; the Replace existing result dialog (single, several, archived, combined with the warning, cancel, focus, double clicks and a stale-list 409); preview paging and errors; selection-bar Compare and its reasons, the comparison dashboard (file chips, metric and view switches, summary by file with Δ vs reference, at-a-glance figures, top differences, row differences, deviation view, keyboard close) and comparison errors; the compact table (no Rows or Columns) and the counts in the preview header; the ⋯ row menu in both tabs, with keyboard use and focus return; downloads from the row menu and the preview, and their failures; the storage notice (saved or memory only) and Clear my data: its confirmation, Escape and Cancel, success, failure and being disabled during a run; and a file identity regression: the Replace dialog, Run & Replace, Archive and Compare act on full File IDs when names repeat |
| Unit (Vitest, Tesseract mocked) | `client/src/lib/convert/ocr.test.ts` | Turning OCR words into rows and cells, the worker and core loaded from this site (choosing the build the browser supports), one worker for several pages, the no-text and download-failed messages, the 50-megapixel limit and an image that can't be loaded, "getting ready" until the worker is ready and only then "reading", Cancel settling a read that tesseract.js itself never settles, and ending the worker after success, failure and Cancel |
| Unit (Vitest) | `client/src/lib/convert/layout.test.ts` | Grouping positioned text into rows by height and cells by gaps (word spaces, column gaps, uneven rows, blank and zero-height items, short rows) |
| Unit (Vitest) | `client/src/lib/convert/table.test.ts` | Which files are converted (by extension, images included, with the 20 MB limit), finding a partner header row below title rows, padding and flagging rows with the wrong number of cells, leaving out repeated header rows, and CSV quoting and file names |
| Unit (Vitest, real SheetJS workbooks) | `client/src/lib/convert/excel.test.ts` | Excel numbers kept as stored whatever their format, dates as YYYY-MM-DD, every sheet and table (tables never merged), total, note and formula rows, `.xls` files, and an unreadable workbook |
| Unit (Vitest, pdf.js mocked) | `client/src/lib/convert/pdf.test.ts` | Reading pages in order with page-by-page progress, the 20-page limit, scanned pages read by OCR at 300 DPI in order with text pages, the canvas, page and OCR worker released, OCR failure and Cancel during OCR, an unreadable file, and releasing the document after success, failure and Cancel |
| Unit (Vitest + React Testing Library `renderHook`) | `client/src/hooks/useConversion.test.ts` | One conversion at a time: cancelling, unmounting or starting another file ends it and stops its reader, a late reader result, failure or progress is ignored, PDFs and images use their readers, the status line by page and while OCR gets ready, which content OCR read, and Import hands back the CSV |
| Component (Vitest + React Testing Library, readers mocked) | `client/src/pages/FilesPage.convert.test.tsx` | Importing Excel, PDF and image files (images offered in the file picker; page progress in a live region; Cancel while reading stopping the reader and moving on; the Read by OCR warning naming the pages, and absent for text PDFs; an OCR failure not blocking the next file), and earlier (PDFs offered in the file picker, a repeated header left out): the review dialog (partner, header row, rows to check, cell text shown as text), Import as CSV uploading `<name>.csv`, Cancel and Escape uploading nothing, one review at a time, and files that can't be converted named while the others still upload |
| Component (Vitest + React Testing Library, nothing mocked: real file service over `fake-indexeddb`, real SheetJS, real sample files) | `client/src/pages/FilesPage.workflow.test.tsx` | The whole workflow on the real Files page: the five samples, uploading a sample CSV, reviewing and importing an Excel file, running all three functions on both, previewing a result's problem row, downloading a result (original columns, both File IDs, masses), and comparing the CSV's and the Excel import's results with no row differing |

`npm test` runs the Node tests in `tests/` (shared logic, the file service and the release tooling) and the client unit/component tests. Client tests use Vitest, React Testing Library and jsdom; page tests mock the file actions in `client/src/lib/api.ts`, which `tests/file-actions.test.ts` and `client/src/lib/api.test.ts` cover for real, and `FilesPage.workflow.test.tsx` runs the page against them unmocked. `npm run verify` also type-checks and builds the client. These replace required manual acceptance checks; they do not establish real-browser layout or visual correctness. Run `npm test -w client` for client tests only.

The Excel file the workflow test uploads, `client/src/test-fixtures/partner_b_baseline.xlsx`, is made from `sample-data/partner_b_baseline.csv` (with a title row above the header) by `node scripts/make-excel-fixture.mjs`. It is test data only and is left out of release zips.

## Importing Excel, PDF and image files

The five sample CSVs in `sample-data/` match a partner's columns exactly, so they need no mapping and are never changed; they also serve as the regression check for universal ingestion. Each has one planted problem (see `sample-data/README.txt` and **Demo steps**), so each opens as **Needs Review**, which can still be processed. To try other column names, upload a copy of a sample with renamed headers.

The upload area also takes Excel files (`.xlsx` or `.xls`, up to 20 MB). They are converted in the browser before anything is sent: every sheet is read and its tables are found, whatever sits above them (a table starts at a row of column names above a row of numbers or dates, or at a partner's columns). When a file holds several tables you choose one; tables are never merged. A **Review** dialog shows the table, its sheet and range, the first 100 rows and any rows to check: total and note rows are left out and listed, a row with too few cells is padded with empty cells, cells right of the last named column are left out, and formula and merged cells are flagged because their values can't be checked independently. **Import as CSV** uploads the table as `<name>.csv` through the normal upload, so validation, File IDs and **Needs Review** work as for any CSV; **Cancel** uploads nothing. Numbers are imported as stored (a sheet's number format is ignored) and dates as `YYYY-MM-DD`. A later row identical to the header is left out and listed. Other file types are refused with a message, and the other files in the same upload still go through.

PDFs (`.pdf`, up to 20 MB and 20 pages) go through the same review. A page that holds its table as text is read from that text: text at the same height becomes a row and a wide gap starts a new cell, and the pages are read in order, so a table can continue across pages (a header repeated on each page is left out). Row numbers in the review count text lines from the top of page 1. A row with a missing cell can't be lined up from gaps alone, so it is flagged as short, never guessed.

Scanned PDF pages (an image, no text) and photos or scans of a table (`.png`, `.jpg`, `.jpeg`, up to 20 MB and 50 megapixels) are read with OCR (Tesseract, in the browser). A scanned page is drawn at 300 DPI (a little less for pages about A3 size or larger, so the drawing stays within what phones allow), and its words go through the same row and cell rules as text PDFs, so a PDF can mix text and scanned pages. The upload area shows "Reading report.pdf: page 2 of 5…" with **Cancel**, which stops the reading, uploads nothing and moves on to the next file. OCR loads only when a file needs it: Tesseract's worker and its WebAssembly core (about 4 MB) come from this site, and the first time, its English language data (about 10 MB) comes from Tesseract's CDN; the page says "Getting OCR ready" meanwhile, and the browser keeps the language data for next time. No file leaves the browser. OCR can misread digits and decimal points, so the review shows **Read by OCR: check the numbers**, naming the pages it read: compare them with the original before **Import as CSV**.

**Other column names.** A table does not need a partner's column names, in any of the four file types (CSV, Excel, PDF or image). A table whose columns are not a partner's is kept as **Needs Mapping**, and **Map columns** opens: for each field (batch ID, sample date, mass, R-32, R-125, R-134a) choose the column that holds it, and confirm the unit of each measurement. Units come from the column name when it states one, then from a supplier profile you saved, then from your confirmation. Mass can be kg, lb or g, and composition percent (0–100) or fraction (0–1); both are converted to kg and percent, and every conversion factor is kept. An unsupported or unconfirmed unit blocks processing, and a value range only warns (0.40 could be 0.40% or 40%). A column that fits two fields, or two columns that fit one, is reported rather than picked. Choosing **Save as supplier profile** remembers the mapping to suggest it for the next file with the same columns; it never confirms anything for you. A file shows one of three states: **Needs Mapping**, **Needs Review** (some rows have problems, and are left out of calculated values) or **Ready**, then **Processed** once a result exists.

**Rows that can't be calculated.** A row with a blocking error (a missing or invalid mass, a negative percentage, a total outside tolerance) is excluded: it gets no calculated value, never a zero, and the result says how many rows were excluded. A file-level problem (an essential field with no column, an unconfirmed unit, or a value read from a PDF or image that is not yet decided) blocks the whole file. The check runs inside the file service on every run, not only in the page.

**Tracing a result.** The original Excel, PDF, image or CSV is kept beside each file, with the sheet and cell, or page and row, that each row came from. Each result records its input File ID, source type, mapping, units, factors, validation decision and the processing function's version, and choosing a calculated value in a result's preview explains it: the raw source cell, the unit, the factor and the value used. Exported CSV columns are unchanged. A result that was uploaded, or processed before traces were recorded, has no trace; run the function again to record one.

## File status and selection

The **Processing function** column says which function made each file: **Original** for uploaded inputs, or **Validation**, **Mass Calculation** or **Classification** for results. Each file shows its **File ID** (`101010`, `101010-V`) and **File Name** in separate columns, so files with the same name stay distinct (row and column counts are shown in **Preview**, not in the table); an uploaded result is marked **Imported** and gets a new ID. It is linked to its original ("Imported from 101010") only when its `file_id` names an input in the workspace and its original columns and values match that input exactly, in any column order; otherwise it records the source it named but stays unlinked ("not linked to 101010"). The preview, the processing panel and the comparison chips show the File ID too. The filters sit together in one card: search by File ID or file name (`101010` finds the input and its results), **Date Range**, **Processing Function** and **Status**. They combine, apply within the current tab, and **Clear filters** (enabled once any filter is set) resets them all. **Sort by**, at the right of the tabs, orders the list by upload time (newest first by default), name or File ID (each original followed by its `-V`, `-M`, `-C` results); the Archived tab also offers, and starts with, **Archived (newest)**. Each tab keeps its own sort, and the sorted column's header shows an arrow. Input files without invalid rows are **Ready**; inputs with invalid rows are **Needs Review** and remain selectable for all three functions. The status filter includes both states. Results remain **Processed**; open **Preview file** from a row's ⋯ menu to see which rows are invalid and why. Listing files never reads a CSV or writes anything.

Every row, input or result, can be selected. **Run Processing** uses only the selected inputs, and the processing panel lists every selected input filename, including selections hidden by filters. Filters do not clear selections; select-all affects the visible rows. Processing a file does not repair its source data, so an invalid input remains Needs Review after a successful run.

The list has two tabs, **Active Files** and **Archived**, each showing its file count. Selecting rows shows a bar at the top of the table with the count, **Clear selection** and **Archive N files**. A toast confirms the change and offers **Undo** for a few seconds. The **Archived** tab notes that archived files are excluded from processing and comparison, lists them most recently archived first with **Archived On** and **Original Upload** dates, and offers **Restore N files** in the selection bar. Every row has a ⋯ **Actions** menu with **Preview file** and **Download file**; archived rows add **Restore file**. Closing a preview returns focus to that row's ⋯ button. Restored files keep their status. Search, date and status filters apply within the current tab. Archiving only sets a flag: no CSV is moved or deleted, and archived files can still be previewed and downloaded. Archived files are left out of processing and the compare dropdowns. Re-running a function on an input replaces its result once confirmed, so an archived result comes back as a new, unarchived one.

## Architecture page

For an active Admin or an Admin demo, **Architecture** (in the header), or `/architecture`, is an engineering case study for walking through the design: the technology stack with the reason and trade-off for each tool, an interactive architecture diagram that follows the Upload, Process, Compare and Generate actions and shows which files implement each component, the main design decisions, how storage is kept separate from hosting, trade-offs, and what would change as the product scales. `client/src/pages/architecture-content.test.ts` checks that every repository path, package and quoted limit on the page matches the code.

## CSV generator

As an active Admin or in the Admin demo, open **CSV Generator** (in the header), or go to `/generator`, to make more synthetic partner CSVs. Choose **Partner A, B or C**, the number of **Rows** per file (1–5,000), the **Number of files** (1–10), and **No errors** or **Include errors** with the number of **Rows with errors** per file. **Generate** lists the files; **Preview** shows a file's planted errors and first 10 rows. **Download** saves a file through the browser (to its usual download folder), and **Add to CSV Files** uploads them all like any other file.

Files are named `partnerA-MMDDYYYY-001.csv`, `-002` and so on: the partner, the day they were made and their number in the batch (e.g. `partnerA-11092026-001.csv`). Numbering restarts at 001 for each batch, and names can be edited before downloading or adding. No two files in a batch have the same data: each gets its own random seed, and a file that matched another would be regenerated.

Generated files use the partner's own columns and units, the same as the samples: A in kilograms and percentages, B in pounds and percentages, C in grams and fractions. Batch IDs run from `A-001` (wider for over 999 rows) and dates from 2026-09-01, so a generated file shares batch IDs with that partner's samples. Clean rows always pass Composition Validation. With errors, exactly the requested number of rows in each file fail it, each with one of: missing mass, non-numeric mass, a negative R-125 percentage, a composition total 15 points short, a missing batch ID, or a duplicate batch ID (which always marks two rows). Nothing is saved until you add the file.

## Demo steps

Open the site, which goes to `/sign-in`. Press **Try Demo**, then **Sign In**: the workspace opens with the five samples. **Try Admin Demo** then **Sign In** opens the same workspace and also the Admin page (fictional accounts; invite, resend, extend, revoke, role and access changes are simulated and say so), Architecture and Generator.

1. Open **Preview** on `partner_a_baseline.csv` to show its original columns. It is **Needs Review**; Preview lists and highlights row 8 (`mass missing`).
2. Click the row to select it, choose **Component Mass Calculation**, and click **Run Processing**. A **Data Quality Warning** lists the file with *24 valid rows · 1 invalid row* and explains that valid rows will be calculated, while invalid rows stay in the output with error details and no calculated values. Click **Process Valid Rows**. The row shows *Processing…*, then the result preview opens with the new columns highlighted. (**Cancel** sends nothing and keeps the selection.)
3. **Download** the result and open it: every original column is unchanged, including the input's `file_id`, and `result_id`, `r32_mass_kg`, `r125_mass_kg`, `r134a_mass_kg`, `processing_status` and `validation_errors` are added at the end. Row 8 is `Invalid` with `mass missing` and blank masses; every other row is `Valid` with an empty `validation_errors`.
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

Every result ends with `processing_status` (`Valid`/`Invalid`) and `validation_errors`. Invalid rows keep their original values: Mass leaves the masses blank, and Classification writes `Needs review` with a blank `dominant_component` and `r32_r125_over_50`. Validation also adds `composition_total_pct`.

Older exported results remain readable and downloadable unchanged. Compare results from the same function and output schema (with or without `result_id`). Classification results made before `r32_r125_over_50` existed still compare with new ones; that column is then left out of the comparison. If one uses the much older pre-`processing_status` columns, regenerate it from its original input before comparing it with a new result. No data reset or migration is required. Processing rejects source-column names that would be overwritten by generated columns.

Composition totals within ±0.5 percentage points of 100% count as valid. Batch Classification uses demo-only thresholds (`DEMO_CLASS_RULES` in `shared/processing.ts`): R-32 ≥ 40% is *R-32-rich*, otherwise R-134a ≥ 34% is *R-134a-rich*, otherwise *Balanced*. It also adds `r32_r125_over_50`: `Yes` when R-32 + R-125 is above 50% (exactly 50% is `No`), `No` otherwise. On the sample files every valid row reads `Yes`, since R-32 + R-125 is 62–77% there.

## Known limitations

- Source data is never repaired. A Needs Review input stays Needs Review after processing; fix the CSV and upload it again.
- Both rows of a duplicate batch ID are marked Invalid; neither is picked as the correct one.
- Comparison matches rows by batch ID only when every pair of compared files shares IDs (a partner's baseline and follow-up); files from different partners share none, so their rows are matched by position, up to the longest file. The comparison states which was used. A repeated ID is matched occurrence by occurrence, and a blank ID never matches.
- Only results from the same function and the current column layout can be compared. Regenerate an older result before comparing it with a new one.
- A comparison holds at most 50,000 rows across its files, so the page stays responsive; above that it is refused with "Too many rows to compare", naming the total.
- A confirmed re-run of a function on the same input replaces the earlier result under the same File ID; there is no version history. A result is first saved with a create-if-absent write, so of two first runs of the same result at the same moment one is saved and the other is refused, like any unconfirmed re-run. Two *confirmed* replacements at the same moment both write and the last one is kept (both are made from the same input, so only the save time differs). File IDs end at `999999`.
- Processing runs in the browser, one file at a time, which suits interview-sized files. Preview lists the first 100 problem rows in detail.
- Classification thresholds are demo-only, and no purity or recovery is inferred from feed composition.
- Automated tests cover behavior in jsdom; they do not check real-browser layout or visuals.
- The processing check (an approved mapping, confirmed units, no file-level blocking issue) runs in the file service, which every caller uses, but that code runs in the browser, so it cannot stop someone who edits the app's own code or its browser storage. There is no server to enforce it: trusted enforcement covers sign-in, access, file ownership and Admin actions, while the processing check stays advisory, also in cloud workspaces (decided 2026-11-23).
- Ingestion is deliberately cautious. Only mass in kg, lb or g and composition in percent or fraction are supported; any other unit blocks processing. Tables are never merged, even when a workbook splits one across sheets. A PDF row with a missing cell is flagged rather than placed by guesswork, and a scanned PDF or photo can only be as good as the OCR: every value it flags (look-alike letters, low confidence, lost decimal points or minus signs) must be kept or left blank, and nothing is corrected for you. OCR language data comes from a CDN the first time. Cells with formulas are flagged because their values can't be independently checked.
- A result made before traces were recorded (19.8), or uploaded as a CSV, has no trace and can't be explained; run the function again on its input to record one.
- Supplier profiles only suggest; each new file still needs its mapping and units confirmed.
- `/generator` and `/architecture` are client-side pages. Their gate is in the browser: the app does not download a denied page, but its code holds no secrets and can still be fetched directly. The Vite dev and preview servers serve them directly, and the build copies `index.html` to `dist/generator/` and `dist/architecture/` (`client/src/lib/pages.ts`) so a static host such as the Vercel deployment serves them too. That has not yet been confirmed on a live deployment.

## Layout

```
client/        React + Vite UI, styled with SCSS Modules on design tokens
  src/App.tsx      picks the page from the URL
  src/pages/       FilesPage (the file workspace, shown as "Dashboard"), GeneratorPage (/generator), ArchitecturePage (/architecture), AdminPage (/admin), and the sign-in pages
  src/components/  Banner (shared message box), and one folder per feature, one component per file:
    layout/        the access gate, and the app header, account menu and left navigation every app page shares (AppShell)
    files/         the CSV Files workspace: sidebar, filters, tabs, sort menu, file table, row menu, toolbars
    compare/       the comparison dialog and its charts and tables
    modals/        the dialog shell, the run confirmations and the file preview
    generator/     the CSV Generator's options, generated file list and preview
    architecture/  the Architecture page's sections, and content.ts with the text they show
    Each feature folder has an SCSS Module (*.module.scss).
  src/styles/      tokens.css (design tokens), _mixins.scss, reset.css (the base reset), base.css, menu-select.css (native selects),
                   and the shared page.module.scss and tables.module.scss
  src/hooks/       the workspace state, one hook per file: file list, selection, filters, archiving, processing
  src/lib/         api (the file actions, run in the browser), access (who may open which page), cloud-storage (Supabase), browser-storage (IndexedDB, or memory), samples (the bundled sample CSVs),
                   file-status (file rules), compare-view (comparison rules), format
shared/        code with no Node imports, run in the browser (a test in tests/ enforces it)
  types.ts         types and the processor list
  csv.ts           CSV parse/export
  adapters.ts      partner header and unit mappings -> one normalized record
  processing.ts    the three processing functions
  compare.ts, generate.ts   comparison and the CSV generator
  storage.ts       the Storage interface every storage implements
  file-service.ts  the file actions (upload, rows, download, archive, process, compare, generate) over a Storage
tests/         Node-side tests: shared logic, the file service and the release tooling
sample-data/   the five synthetic partner CSVs (never edited)
```

## Styling

The client styles itself with SCSS Modules on design tokens, with no utility-class framework (build-plan M13). `client/src/styles/no-tailwind.test.ts` fails on `@apply`, `@reference`, a Tailwind package or a class name written as a string, and `no-raw-colors.test.ts` fails on a hex, `rgb()` or `hsl()` colour anywhere outside `tokens.css` (stylesheets and source, stories included).

- **Tokens** live in `client/src/styles/tokens.css` as `--app-*` CSS custom properties: palette, semantic colours, type, spacing, radii, shadows, motion and z-index layers. `tokens.test.ts` checks that every token exists, that semantic colours are built from palette steps, and that each text/background pair meets WCAG AA contrast.
- **Charts** use `--app-color-chart-grid`, `--app-color-chart-axis`, `--app-color-chart-reference` and `--app-chart-text`, passed to Recharts as `var(…)` strings. The file colours are `--app-chart-series-1` to `-5`, read through `FILE_COLORS` in `client/src/components/compare/fileColors.tsx`, so a file keeps its colour in every chip, chart and table; each is at least 3:1 on the surface.
- **Use semantic tokens only** in components (`--app-color-text`, `--app-color-surface`, `--app-color-danger-text`, `--app-space-4`, `--app-radius-xl`), never palette steps such as `--app-color-slate-600`, so a future theme only overrides the aliases. If no semantic token fits, add one to `tokens.css` and its test instead of hardcoding a value.
- **Mixins** live in `client/src/styles/_mixins.scss`: `up(sm|md|lg|xl)` for min-width breakpoints (media queries can't read CSS variables, so breakpoints live only here), `focus-ring`, `reduced-motion`, `visually-hidden` and `spin` (a turning loading icon). Every interactive element gets `focus-ring`.
- **Writing a module:** put `Component.module.scss` next to its component, start it with `@use '../styles/mixins' as *;` (relative path), import it as `styles`, and combine classes with `classNames` from `client/src/lib/class-names.ts`. `client/src/components/Banner.module.scss` is the reference example.
- **Naming:** camelCase class names that say what an element is (`.message`, `.dismiss`), not how it looks (`.greenText`); variants are separate classes (`.success`, `.error`).
- **Shared components** live in `client/src/components/ui/`, each with its module, tests and a Storybook story (`npm run storybook`). Use them instead of styling a raw `<button>` or panel:
  - `Button`: `variant` is `primary` (the main action in a place), `secondary` (the others beside it), `success` (start or confirm a safe run), `danger` (confirm a destructive one), `outline` (a light action in a panel or toast), `ghost` (icon buttons such as Close) or `link` (a text action in a sentence or toolbar); `size` is `sm`, `md` or `lg`; `loading` disables it and shows a spinner; an icon-only button needs an `aria-label`. A link that navigates stays an `<a>`.
  - `Card`: the white panel; `as` picks `div`, `section`, `article` or `form`.
  - Pass `className` for layout only (`w-full`, `ml-auto`), never for colour, padding or shape.
- **When to make a `ui/` component:** when the same control or container (button, card, dialog, menu) appears in more than one area. Add it to `client/src/components/ui/` with its module, tests and a `*.stories.tsx`; `components/stories.test.tsx` renders every story and runs its `play`, so a stale story fails `npm run verify`. Layout specific to one area stays in that area's module.
- **Motion:** `base.css` shortens every animation and transition for people who ask their system for reduced motion; use `reduced-motion` for anything that needs more.

## Storybook

Storybook (`npm run storybook`, http://localhost:6006) documents the shared components: everything in `client/src/components/ui/`, `components/Banner.tsx`, the dialog `components/modals/Modal.tsx` and the file row's ⋯ menu `components/files/RowMenu.tsx`. Other feature and page components have no stories; their page tests cover them.

- **Update stories with the component.** Adding a shared component, or changing its props, variants or states, updates its `*.stories.tsx` in the same change.
- **Format:** CSF 3 in `Component.stories.tsx` beside the component, titled by folder (`UI/<Name>`, `Modals/Modal`, `Files/RowMenu`):
  ```tsx
  const meta = { title: 'UI/Button', component: Button, args: { children: 'Save' } } satisfies Meta<typeof Button>;
  export default meta;
  type Story = StoryObj<typeof meta>;
  export const Loading: Story = { args: { loading: true } };
  ```
  Shared defaults go in meta `args`; each story sets only what differs.
- **One story per meaningful state**, named by the state (`Primary`, `Loading`, `Disabled`, `Error`, `Empty`). Prefer `args` to a custom `render`; use `render` only to show several instances together (`Sizes`) or to open a dialog from a button (`ClosingReturnsFocus`).
- **Docs:** `parameters.docs.description.component` says what the component is for, when not to use it, and its accessibility contract. `Button.stories.tsx` is the example.
- **No network or app state:** stories get their data from `args` and never import the API client. Callbacks use `fn()` from `storybook/test`, so they show in the Actions panel and can be asserted.
- **Interactions** go in a story's `play` function, using `userEvent`, `expect` and `within` from `storybook/test` and querying by role and label. Each scenario lives once, in its story: a standalone component test keeps only what a story can't show (class tables, behaviour inside a page). A dialog or menu renders in a portal outside the canvas, so query `within(canvasElement.ownerDocument.body)`.
- **Styling in stories** uses the component's props and the tokens (`var(--app-space-4)`), never literal colours or sizes.
- **Motion:** stories show only the motion the components have. Button's `Motion` story documents the colour transitions on `--app-duration-fast` and `--app-ease`, the `spin` mixin, and how to emulate `prefers-reduced-motion` in DevTools; the dialog and row menu have no entrance or exit animation.
- **Checks:** `client/src/components/stories.test.tsx` finds every `*.stories.tsx` under `components/`, fails when a shared component listed above has no stories, renders every story and runs its `play`, all in `npm run verify`. CI also runs `npm run build-storybook`, so a broken config or story import fails the PR; run it locally when Storybook's config, addons or a story's imports change.

## Settings

The app has no runtime settings. These limits are fixed in code, each as one named constant:

| Constant | Value | File |
| --- | --- | --- |
| `PREVIEW_MAX_ROWS` | 1,000 rows per preview page (100 by default) | `shared/file-service.ts` |
| `PARSED_CACHE_FILES` | 10 parsed files kept for previews and comparisons | `shared/file-service.ts` |
| `UPLOAD_MAX_MB` | 10 MB per CSV upload | `client/src/lib/api.ts` |
| `GENERATOR_MAX_ROWS`, `GENERATOR_MAX_FILES` | 5,000 rows per generated file, 10 files per request | `shared/types.ts` |
| `GENERATOR_FIRST_DAY`, `GENERATOR_RANGES` | Generated rows start on 2026-09-01; mass 110–140 kg, R-32 33–43 %, R-125 26–33 % | `shared/generate.ts` |
| `DEMO_CLASS_RULES` | Demo classification thresholds: R-32-rich from 40 %, R-134a-rich from 34 % | `shared/processing.ts` |
| `R32_R125_FLAG_ABOVE` | `r32_r125_over_50` reads Yes when R-32 + R-125 is above 50 % | `shared/processing.ts` |
| `TOAST_MS` | The archive/restore toast stays 8 seconds | `client/src/hooks/useArchive.ts` |

## Deploy

Local development needs no account or cloud service. Vercel builds the client and serves it as one static site (`vercel.json`), with no server; see [the deployment notes](blueprint/vercel-deployment.md). The build variables are `APP_ENV_LABEL` and the two public Supabase values described there.

**Releases.** Versions are worked out automatically from the PR titles (`fix:` patch, `feat:` minor, `feat!:` major) by release-please, which keeps one `chore: release X.Y.Z` PR open with the next version and `CHANGELOG.md`. Merging it creates the `vX.Y.Z` tag and GitHub Release. The current version shows at the end of each page's navigation: `· Test` on the Vercel site (set with the build variable `APP_ENV_LABEL=Test`) and `· Preview` on other branches' Vercel Previews. See "Releases" in [blueprint/commit-rules.md](blueprint/commit-rules.md).

**Release zip.** Each published release also gets `icorium-vX.Y.Z.zip`, its `.sha256` and a manifest as release assets, built from the exact tag by `.github/workflows/release-artifact.yml`. The zip holds only the files in `release/allowlist.txt` plus `DEPLOY.md` (how to install and build it, then serve `client/dist` from any static host). Vercel is the Test site; where Production runs is not decided yet. See "Releases and environments" in [blueprint/vercel-deployment.md](blueprint/vercel-deployment.md).

## Extending

- **New partner CSV schema:** add one entry to `ADAPTERS` in `shared/types.ts`, listing its id, name, description, column names, unit factors and number formats. Uploads, processing and the CSV generator all read it.
- **New header spelling or unit for a known field:** add it to `FIELD_ALIASES` in `shared/types.ts` (with the unit the spelling states, if any). Matching is exact partner columns first, then normalized headers, then these aliases, then manual mapping; accepted units and their factors are in `shared/units.ts`. A supplier whose columns differ needs no code: map them in **Map columns**.
- **New input file type:** convert it to a table in `client/src/lib/convert/` (see `excel.ts`, `pdf.ts`, `ocr.ts` and the shared rules in `pages.ts`), then hand the CSV text and a source record (`toUploadSource`) to the normal upload, so mapping, units, the processing check and traces apply unchanged. The file service stays CSV-only.
- **New processing function:** add an entry to `processors` in `shared/processing.ts`, plus its id, code and labels in `PROCESSORS` in `shared/types.ts`. The file service's accepted functions and the file table's label follow from `PROCESSORS`.
- **Storage:** every backend implements `Storage` in `shared/storage.ts`, and `createFileService(storage)` runs the file actions over it. The app uses `client/src/lib/cloud-storage.ts` (Supabase) for accounts and `client/src/lib/browser-storage.ts` (IndexedDB, or memory) for the demo. Another backend would be another `Storage`, without changing processing or the UI.
