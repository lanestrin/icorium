# Reclaim Studio — Build Plan

**Project:** Icorium full-stack coding exercise  

**Goal:** Deliver the complete CSV workflow in one straightforward application, using the agreed Apple-inspired two-column UI.  

**Stack:** React + TypeScript + Vite + Sass (SCSS Modules) + Lucide React; Papa Parse; Zod; Recharts; Vitest; files kept in the browser (IndexedDB); a static site with no server (since 16.3).  

Earlier revision and status notes from this header are in [the archive](build-plan-archive.md#plan-header-notes).

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

Moved to [the archive](build-plan-archive.md#3-repository-layout); it was out of date. CLAUDE.md's **Layout** section describes the current repository.

## 4. Feature build order

Each numbered item is one work item: one branch, one reviewed scope, one small

PR. This replaces the phase checklist; the requirements elsewhere in this

plan still apply. IDs retain their original phase prefix for traceability.

### What to build next

**Next: 16.4** `feature/16.4-real-file-workflow-test`. Decide how to test below first (Vitest with the real files is recommended), then test the whole workflow with a sample CSV and a real Excel file.

**Order:** 9.14a → 9.14b → 16.1 → 16.2 → 16.3 → 16.4 → 9.14c → 9.15. M16 comes before 9.14c because the live site's API is down while its Blob store is over the Hobby limit, and 9.14c and 9.15 would otherwise describe a server that M16 retires. 9.14 depends on 10.13 (done). The earlier order, including the completed frontend-first block, is in [the archive](build-plan-archive.md#build-order-history).

**After the demo:** once 9.15 is done, the project moves toward a production platform. That direction is [Proposed — Not Yet Implemented](project-plan.md#10-future-direction--proposed-not-yet-implemented); no production items are planned yet, and none may be built until they are added here as approved items.

New work needs a new request: add it as a new stable ID with its scope before building, or use a `fix/` branch for a bug.

**Selection rule:** take the first unchecked item in the order above whose dependencies are

satisfied; once that list is finished, take the first unchecked item below whose dependencies are satisfied. Completed baseline capabilities are not new work. If an item is

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

- Use a named feature branch, then implement and run `npm run verify`, present
  the commit and PR drafts, and wait for explicit approval before commit,

  push and PR publication. The person squash-merges the PR.

- Automated verification is the Node tests in `tests/` (shared logic and the file service), client unit/component tests

  and client type-check/build. UI changes require behavior-focused component

  coverage, including relevant interactions and async success/failure paths.

  Manual UI acceptance passes are not required, and the person is not expected

  to perform them. Browser tests remain removed; restore them only when requested.

- Bugs use a `fix/` branch. Unspecified visual refinements need a concrete

  request or approved reference change before becoming features.

### Completed work

Completed milestones and items are in [build-plan-archive.md](build-plan-archive.md), with their IDs, results and PR references.

- [Former phases 1–7](build-plan-archive.md#existing-implementation-baseline-former-phases-17): the implementation baseline.
- [M8 — Partial processing](build-plan-archive.md#m8--partial-processing): done (4 items, 8.1–8.4).
- [M9 — UI refinements](build-plan-archive.md#m9--ui-refinements): 14 items done (9.1–9.13); its open items are below.
- [M10 — Code review fixes](build-plan-archive.md#m10--code-review-fixes): done (15 items, 10.1–10.15).
- [M11 — File IDs](build-plan-archive.md#m11--file-ids): done (8 items, 11.1–11.6).
- [M12 — Releases and environments](build-plan-archive.md#m12--releases-and-environments): done (2 items, 12.1–12.2).
- [M13 — Styling architecture and design system](build-plan-archive.md#m13--styling-architecture-and-design-system): done (7 items, 13.1–13.7).
- [M14 — Frontend resilience and component coverage](build-plan-archive.md#m14--frontend-resilience-and-component-coverage): done (8 items, 14.1–14.5c).
- [M15 — Planning documents](build-plan-archive.md#m15--planning-documents): done (1 item, 15.1).
- [M7 — Final interview readiness](build-plan-archive.md#m7--final-interview-readiness): done (1 item, 7.1).

### M9 — UI refinements

- [ ] **9.14** Convert non-CSV partner files · **P2** — Partners may send Excel files, text PDFs or scanned PDFs and images, added at the person's request on 2026-11-13. They chose to have all three converted, with OCR running in the browser (Tesseract), not an AI service. Conversion runs entirely in the browser before upload. A non-CSV file becomes a table, the header row is found by matching one partner adapter's columns (`ADAPTERS` in `shared/types.ts`), and the person reviews the rows in a dialog (**Cancel** or **Import as CSV**). Only then is it passed as `<name>.csv` to the existing upload. The file service stays CSV-only, so validation, File IDs and **Needs Review** work unchanged. Rows with the wrong number of cells are kept and flagged, never guessed. Readers are loaded only when used (dynamic `import()`). Limits: 20 pages per PDF, 20 MB per source file, English OCR. A failed file never blocks the others in a multi-file upload. Libraries: SheetJS `xlsx` 0.20.x from the official cdn.sheetjs.com tarball (npm's 0.18.5 has advisories), `pdfjs-dist` and `tesseract.js`. Tesseract downloads its English language data (~10 MB) from a CDN on first use; no partner data leaves the browser except as the uploaded CSV. Real PDF and OCR reading can't run in jsdom, so tests mock the libraries, and each sub-item's Try it now uses a real file.

  - [x] **9.14a** `feature/9.14a-convert-excel-uploads` — The pipeline: choosing a reader by extension, header detection against `ADAPTERS`, the review dialog, the "`report.docx` can't be converted. Upload a CSV, Excel, PDF or image file." message, a wider drop-zone `accept` list, and the Excel reader (first sheet). Also the stack exception, and the README and Architecture page updates for the new packages.
  - [x] **9.14b** `feature/9.14b-read-text-pdfs` — The pdf.js reader. Text items are grouped into rows by y position and into cells by x gaps. A page with no text layer is refused with "this page is a scanned image" until 9.14c.
  - [ ] **9.14c** `feature/9.14c-ocr-scanned-pdfs-and-images` — Tesseract for image-only PDF pages and `.png` / `.jpg` files, with "Reading page 2 of 5…" progress and **Cancel**, and an "Read by OCR: check the numbers" warning in the review dialog.

  **Conversion lifecycle (applies to 9.14a–c, not a second conversion feature):** apply the following acceptance criteria while specifying 9.14a–c. The pipeline owns one active conversion job, with explicit reading, review, importing, cancelled and failed states. Cancel or closing the review must prevent that job from uploading and ignore any late completion; a cancelled conversion must not block the next file. For readers that support interruption, stop the active work and release it. Scope worker instances, PDF loading/render tasks, image resources and object URLs to the job and release them on completion, failure, cancellation and unmount, as applicable to each reader. Keep any expensive OCR work off the UI thread using the reader's supported worker mechanism. Explain the boundary between conversion cancellation and an upload already submitted; do not promise to undo a stored upload. Deferred-promise/component tests cover cancel-then-late-result, closing/unmounting, cleanup and continuing a multi-file batch after failure or cancellation. Tests may mock the readers, as 9.14 already specifies; real PDF/OCR reading and responsiveness require the real-file Try it now checks. These criteria must be carried into each relevant 9.14 spec before implementation.

  **Depends on:** 10.13 (clear upload errors).

- [ ] **9.15** `feature/9.15-architecture-scaling-and-security` · **P2** — Extend the Architecture & Tech Stack page to answer three interview questions, at the person's request on 2026-11-13: the trade-offs of Tesseract OCR in the browser, the recommended stack if the product scales, and how customer uploads should be secured once the product serves several customers. Presentation only: no API, dependency or stack change. Planned and recommended items are labelled **Planned** or **Recommended, not built**, like the existing "S3 / Cloudflare R2 · Not built". No tech card names Tesseract, SheetJS or pdf.js until 9.14a installs them.

  - **Decisions:** make the existing processing-location card a reusable featured card, and add **File conversion in the browser (planned, 9.14)**. It has benefits (free, no API key, files stay in the browser, no server load, avoids Vercel's limits) and a trade-off box (weaker on blurry, skewed, handwritten or merged-cell scans; ~10 MB language data on first use; slow on many pages or weak devices; no unattended batch runs; every file needs review; switch to a managed document-AI service such as AWS Textract or Azure Document Intelligence when volume or accuracy targets require it).
  - **New section 7, Customers and security (recommended, not built):**
    - One hosted multi-tenant app rather than copies customers download; a dedicated deployment only for contracts that need it.
    - People sign in per customer through a managed OIDC provider with organizations, SSO and MFA, and roles (admin, uploader, viewer).
    - Systems that upload automatically use per-customer OAuth client credentials or scoped API keys: hashed, shown once, expiring, revocable, rate-limited and logged.
    - IP allowlisting is an optional extra layer, never the identity.
    - API keys are not needed today, and the app holds no secrets: it is a static site.
    - Tenant isolation: the customer ID comes from the session or key and is enforced in the one storage layer, plus PostgreSQL row-level security and cross-customer tests.
    - Upload safeguards: quotas and rate limits, content-type checks, presigned uploads to private per-customer storage, malware scanning for any stored PDF or image, encryption, an audit log, retention rules, and formula escaping for files shared outside.
  - **Evolution:** replace the five tiles with a "today → at scale" table:
    - UI: same.
    - API: Fastify in containers.
    - Identity: a managed OIDC provider.
    - Data: PostgreSQL with row-level security, plus S3 or R2 via presigned URLs.
    - Work: a queue and workers.
    - OCR: Tesseract, then managed document AI.
    - Operations: logs, Sentry, metrics, a secrets manager and backups.
  - Content stays in `client/src/components/architecture/content.ts`, reusing the existing section and card patterns, with no sideways scroll at phone width.

  **Done when:** section 7 is in the page and its "On this page" links; the conversion card shows **Planned** with its trade-off; the scale table shows today and at-scale values per layer; component tests cover all three and the content test checks that the planned card is labelled planned; `npm run verify` passes.

### M16 — Temporary demo storage in the browser

Added at the person's request on 2026-11-17. The private Vercel Blob store reached the Hobby plan's usage limit (access resumes 12/14/26), so the live site's API stopped starting. The proof of concept must now run at **no cost**: no paid storage, database or cloud infrastructure. Icorium will later support persistent cloud storage, user accounts and file sharing, but none of that is built until it is explicitly approved.

**Requirements (the person's briefs, 2026-11-17):**

- Standard browser file uploads and temporary in-memory file handling, with real conversions, CSV previews and downloads. Downloads are created in the browser as `Blob` objects.
- IndexedDB only if persistence across page refreshes is necessary. Users never choose a local folder. Vercel's filesystem is never used as persistent storage.
- Keep server-side conversion only where it is required, and never assume temporary server files persist between requests.
- File storage, conversion and processing, and frontend presentation are separate modules. One storage interface has a local demo adapter now, and a cloud-backed adapter can be added later.
- Stable internal file identifiers and metadata that can later carry ownership and sharing. The File ID contract in section 1 is unchanged.
- Uploads and results are temporary demo data. Say they can be lost when browser storage is cleared, offer a way to clear them, and promise no recovery. The five sample datasets always load.
- No accounts, authentication, cloud storage or sharing until explicitly approved. Avoid overengineering and unnecessary dependencies.
- File-size limits stay. Large work must not freeze the UI (a Web Worker only where needed). Unsupported files, malformed data, conversion errors and browser-storage limits are handled clearly.
- **Architecture objective:** moving later to authenticated cloud storage means adding backend services and replacing the storage adapter, not rewriting the upload, conversion, preview or download interfaces.

**Audit (2026-11-17):** nothing requires a server.

- Excel and PDF conversion already runs in the browser.
- CSV parsing (Papa Parse), the partner adapters, the three processors, File ID stamping, result linking, comparison and the generator are plain TypeScript.
- The only Node-only parts are Fastify, the disk and Blob storage backends, and one `randomInt` call in the generator.
- The client reaches the server only through the 8 functions in `client/src/lib/api.ts`.

- [x] **16.1** `feature/16.1-shared-processing-core` · **P1** — Move processing, adapters, CSV handling, comparison and the generator out of `server/src` into shared code with no Node imports. Turn the route bodies in `server/src/routes/files.ts` into plain functions over the existing `Storage` interface: upload, process, archive, rows, compare and generate. No behavior change: the existing server unit and API tests keep passing against the shared code.
- [x] **16.2** `feature/16.2-browser-storage-and-local-api` · **P1** — Store files in the browser and run the app's logic there.
  - A browser storage adapter implements `Storage`: File IDs counting up from `100001`, archive flags and metadata.
  - The five samples are bundled and seeded under their fixed IDs.
  - `client/src/lib/api.ts` calls the shared functions instead of `fetch`, and downloads are browser `Blob`s.
  - A notice that data stays on this device and can be lost, a **Clear my data** action, and clear messages when browser storage is full or unavailable.

  **Depends on:** 16.1.
- [x] **16.3** `feature/16.3-retire-server-and-vercel-blob` · **P1** — Remove the Fastify server, the Blob adapter, `@vercel/blob` and the server service in `vercel.json`, so Vercel serves only the static client, for free. Withdraw the Blob exception in `blueprint/stack.md`. Update the Architecture page, the README, `blueprint/vercel-deployment.md`, `blueprint/project-plan.md`, this plan's header, and the 9.14 and 9.15 text that describes the server. **Depends on:** 16.2.
- [x] **16.4** `feature/16.4-real-file-workflow-test` · **P2** — An automated test of the whole workflow with real files and no mocked results: upload a sample CSV and a real Excel file, run each processing function, then preview, download and compare. **Depends on:** 16.2.

**Open decisions (settle in each item's spec):**

- **16.2, persistence (settled 2026-11-17):** IndexedDB, so files survive a refresh, with memory as the fallback when a browser blocks it.
- **16.3, the Node server (settled 2026-11-17):** retired entirely. Its Node-only tests moved to a `tests/` workspace, and the release zip became a static-site release.
- **16.4, how to test:** Vitest with the real files and a simulated IndexedDB (`fake-indexeddb`, installed in 16.2), or a Playwright browser test as well. Recommended: Vitest, which runs inside `npm run verify`. Playwright is the only real-browser check, but it restores browser tests, which section 4 says need a request.

**Done when (milestone):** anyone can open the public Vercel site without an account, upload a supported file, convert it to CSV, process, preview, compare and download it, with nothing stored outside their browser, and `npm run verify` passes.

## 5. Minimal API outline (suggested, not prescribed)

Moved to [the archive](build-plan-archive.md#5-minimal-api-outline-suggested-not-prescribed).

## 6. Data and correctness decisions

- The five sample files represent **three fictional partners** with different source headers and units. They are synthetic, not actual Icorium records.

- A normalized batch includes `batch_id`, `sample_date`, `feed_mass_kg`, `r32_pct`, `r125_pct`, `r134a_pct`, and `source_company`.

- The original CSV row must be kept separately from normalized fields so that exports preserve the original values.

- Composition totals should be checked with a **documented rounding tolerance** rather than requiring exact floating-point equality.

- An invalid row still appears in processing output with errors rather than disappearing silently.

- Show chart labels with units and whether values represent a sum, average, or count.

- **Do not infer purity or actual separation recovery** from incoming blend composition alone.

## 7. Priority order if time is tight

Moved to [the archive](build-plan-archive.md#7-priority-order-if-time-is-tight).

## 8. Suggested interview demo script

Moved to [the archive](build-plan-archive.md#8-suggested-interview-demo-script).

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
