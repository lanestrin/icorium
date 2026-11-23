# Reclaim Studio - Build Plan

**Project:** Completed Icorium demonstration evolving into an
invitation-only prototype.

**Current milestone:** Private individual workspaces with sign-in and
cross-device storage, followed by permanent deletion and data correction.

**Constraints:** Free-only; preserve existing prototype limits and
browser processing. No teams, sharing or customer organizations yet.

**Stack:** Keep the existing React/TypeScript browser application and
shared processing core. Managed identity, private cloud storage and email
providers are selected in 17.1 before implementation.

Earlier revision and status notes are in [the archive](build-plan-archive.md#plan-header-notes).

> Sections 1-3 describe the shipped demonstration baseline. M17/M18 are the approved next scope, not implemented behavior. Scoped changes to stack restrictions and identity contracts must be explicit in the relevant approved feature specs before implementation.

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

**Next: 17.4 - Private cross-device file workspace.**

The demonstration milestone through 9.15 is complete, and 17.1 to 17.3
are done. M19 (universal file ingestion) comes before the rest of M17
(decided 2026-11-20): it is browser-side, shares no code with 17.3, and
its mapping and provenance metadata should exist before files move to
the cloud in 17.4.

Build in this order:

17.1 -> 17.2 -> 19.1 -> 19.2 -> 19.3 -> 19.4 -> 19.5 -> 19.6 -> 19.7
-> 19.7b -> 19.8 -> 19.9 -> 17.3 -> 17.4 -> 17.5 -> 17.6 -> 17.7
-> 18.1 -> 18.2 -> 18.3

Select only an unchecked item whose dependencies are satisfied.

Each item requires an approved feature spec, implementation and applicable
verification, completion drafts, and separately authorized publication.
A checked item requires evidence; existing code alone is not completion.

The full requirements for this milestone are in [project-plan.md](project-plan.md).
Deferred production capabilities remain outside the build scope.

For the next feature, report its stable ID, title, intended branch, why it
is next and the concrete starting action. Never infer completion from code
or a passing build alone.

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

All completed checklist items are in [build-plan-archive.md](build-plan-archive.md).

- The existing archive preserves the baseline and completed M7-M15 history.
- [Completed conversion, Architecture and browser-storage work](build-plan-archive.md#completed-demonstration-follow-up-archived-2026-11-18) preserves 9.14a-c, 9.15 and 16.1-16.4, including their original requirements and decisions.
- Detailed feature records remain under `blueprint/history/features/`. Stable IDs are never reused.

### M19 — Universal file ingestion, column mapping and validation

Goal: accept supplier CSV, Excel, PDF and image files whatever their
column names or layout, and calculate only from mapped, unit-verified,
validated data that traces back to its source. Requirements and
decisions are in [project-plan.md](project-plan.md#14-universal-file-ingestion-m19).
Built before 17.3 (decided 2026-11-20).

Rules for every M19 item:

- Existing Partner A, B and C files, result files, generated columns,
  File IDs and comparison keep working. The sample CSVs are never edited.
- Never assume a column's meaning or unit without evidence, never
  convert an unverified unit, and never replace a missing measurement
  with zero. Ambiguous values are flagged, never corrected automatically.
- Deterministic only: no AI or external service.
- The processing gate is enforced in `shared/file-service.ts`, the only
  API every caller uses (decided 2026-11-20). It cannot stop someone
  editing the browser's own code; trusted enforcement arrives with 17.4.

- [x] **19.1** Structured validation issues and canonical ingestion
  types — Add the ingestion types (source reference with sheet, page,
  row and column; field mapping and its origin; unit decision and
  factor; validation issue with severity blocking, warning or info, a
  code, field, row, reason and source; the states Needs Mapping, Needs
  Review and Ready for Processing). Row validation returns structured
  issues while `validation_errors` text stays identical. Fix the
  composition total counting missing components as zero.
  **Depends on:** none.

- [x] **19.2** Layered header matching — One matching engine used by
  upload and conversion: exact partner match, then a normalized match
  (case, whitespace and separators folded, unit words kept), then known
  aliases with their stated units, then manual mapping. Report two
  candidates for one field, or one column for two fields, as ambiguous;
  never pick the first silently. Partner A, B and C still match exactly.
  **Depends on:** 19.1.

- [x] **19.3** Unit verification and normalization — Decide units from
  an explicit header or alias unit, then a supplier profile, then user
  confirmation. Value ranges only warn. Support kg, lb and g, and
  percent (0–100) or fraction (0–1), normalized to kg and percent for
  the unchanged processors, recording each factor. Unsupported or
  unconfirmed units, and ambiguous decimal or thousands separators,
  are blocking.
  **Depends on:** 19.2.

- [x] **19.4** Stored mapping and the processing gate — Store an
  unrecognized or ambiguous upload unchanged as Needs Mapping instead
  of refusing it. Add a validated action to confirm a mapping and its
  units, optionally saved as a supplier profile that only suggests.
  Processing refuses an input without an approved mapping, confirmed
  units, resolved file-level blocking issues and recorded provenance.
  A blocking row error excludes that row (no calculated value, never
  zero), disclosed in the result and comparison (decided 2026-11-20).
  Existing records that exactly match a partner count as approved.
  **Depends on:** 19.3.

- [x] **19.5** Import review and mapping UI — One import review step for
  every file type, including a CSV that needs mapping: file and table,
  original headers, suggested mapping with a choice per field and Not
  used, unit confirmation, sample values, row counts, blocking errors
  and warnings, and why processing is blocked. Show the ingestion
  states. A confidently mapped, validated file needs no forced review.
  **Depends on:** 19.4.

- [x] **19.6** Excel sheets, tables and formulas — Read every sheet with
  correct cell coordinates, find candidate tables (the user chooses
  when there are several; never merged), tell header, data, total and
  note rows apart, flag duplicate or missing headers, and flag formula
  values that cannot be independently validated. Keep sheet and cell
  provenance.
  **Depends on:** 19.5.

- [x] **19.7** PDF and OCR safeguards — Keep page numbers per row,
  detect repeated headers across pages, place empty cells and detect
  misalignment from cell positions, keep OCR confidence, and flag
  ambiguous numbers (O/0, I/1, S/5, lost decimals or minus signs,
  merged digits) for confirmation instead of correcting them. Show
  extracted values beside their source page and row.
  **Depends on:** 19.5.

- [x] **19.7b** PDF and image tables with other headers — Find a header row
  that is not a partner's in PDF and image text, using the same
  positioned cells as 19.7, and import it as Needs Mapping so the Map
  columns dialog opens, as it does for Excel and CSV. Values to confirm
  from 19.7 still block until decided. Split from 19.7 on 2026-11-22.
  **Depends on:** 19.7.

- [x] **19.8** Provenance and result traceability — Keep the original
  source file and per-row source references in browser storage (with
  a storage upgrade), and record on each result its input File ID,
  source type, mapping, units, factors, validation decision and
  processing function version. Explain a calculated value from its raw
  source cell. Exported CSV columns stay unchanged.
  **Depends on:** 19.6, 19.7b.

- [x] **19.9** Ingestion regression, acceptance and documentation —
  One automated test per acceptance criterion in project-plan section
  14, regression for all samples, existing results and comparison, and
  updated Architecture page, sample-data notes and extension guide,
  including known limitations.
  **Depends on:** 19.8.

### M17 — Invitation-only private workspaces

- [x] **17.1** Validate the free hosted-service design — Select the
  smallest supported combination for identity, private metadata/files
  and email. Verify free limits, existing-file access at capacity,
  Google sign-in, invitation-only activation, deactivation, sender
  requirements and upgrade/export paths. Define initial Admin
  bootstrap, cloud File ID ownership/namespace and the hosted
  verification approach. Document any conflict before implementation.
  No service provisioning or paid plan is authorized by this item.

- [x] **17.2** Account activation and sign-in foundation — Add the
  selected identity integration with email/password, Google sign-in,
  sign-out, password recovery and invitation-bound activation.
  Establish trusted Admin/Member roles and the initial Admin.
  Public self-registration must not grant workspace access.
  Keep the existing demo usable until the signed-in cloud workflow
  is ready.
  **Depends on:** 17.1. Split into 17.2a and 17.2b (decided 2026-11-18).

  - [x] **17.2a** Identity schema and invite-only activation rules —
    Add the Supabase SQL migration for profiles and invitations, the
    "Before User Created" hook that rejects any new user (password or
    Google) without a pending, unexpired, unrevoked invitation, profile
    creation with the invited role only once the email is confirmed,
    row-level security, and the documented first-Admin bootstrap.
    Record the `stack.md` exception. No client change. Hosted evidence
    is deferred to 17.7.
    **Depends on:** 17.1.

  - [x] **17.2b** Sign-in, activation, recovery and sign-out — Add the
    Supabase client and the sign-in (email/password and Google),
    invitation activation (name plus password or Google), password
    recovery and sign-out screens, reading the trusted role from the
    profile. Keep the existing demo usable; sign-in is not required yet.
    **Depends on:** 17.2a.

- [x] **17.3** Admin invitations and account access — Add the Admin
  page for email invitations with Member as the default role.
  Support the agreed 30-day expiry, resend, extend and revoke
  controls, role changes, deactivation and reactivation. Retain files
  on deactivation and enforce access changes for existing sessions.
  Admin cannot read members’ file contents.
  **Depends on:** 17.2.

- [ ] **17.4** Private cross-device file workspace — Persist registered
  users’ files, results and metadata through the selected cloud
  services. Preserve the existing workspace and processing workflow,
  applying the approved identity contract and trusted owner checks
  to every file operation. Refuse affected new uploads at capacity
  with clear feedback.
  **Depends on:** 17.1, 17.2.

- [ ] **17.5** Isolated guest demo and existing-file export — Add
  Try the demo credential autofill followed by login submission.
  Each demo receives isolated temporary browser data and sample
  files, with cleanup on session end. Provide export access to
  pre-existing browser files without automatically uploading them
  or erasing them during demo cleanup.
  **Depends on:** 17.2, 17.4.

- [ ] **17.6** Require sign-in and apply page access — Make the file
  workspace the signed-in landing page. Require either an active
  invited account or an isolated demo session for file tools.
  Restrict Admin, Architecture and Generator pages to Admin.
  Complete direct-route and trusted-service access enforcement.
  **Depends on:** 17.3, 17.4, 17.5.

- [ ] **17.7** Hosted workflow verification and operating guidance —
  Demonstrate invitation acceptance, both sign-in methods,
  cross-device files, cross-user isolation, deactivation, demo
  isolation and supported service-limit behavior. Record actual
  hosted evidence, capacity limitations and provider upgrade/export
  steps. Keep the Architecture page and setup documentation accurate.
  No deployment or invitation sending without explicit authorization.
  **Depends on:** 17.6.

### M18 — File deletion and correction

- [ ] **18.1** Permanently delete selected files — Add an explicit
  confirmation and permanent deletion of the owner’s selected file.
  Deleting an input keeps its results available, with their source
  marked deleted. Deleting a result leaves its input and other
  results unchanged. Preserve Archive/Restore and report failures
  accurately.
  **Depends on:** 17.6.

- [ ] **18.2** Identify correctable validation cells — Expose
  structured validation issues that identify editable input cells,
  including row-level or multi-column rules. Preserve processing
  validation and existing error explanations. Explain issues that
  cannot be corrected through cell editing. Builds on the structured
  issues from 19.1.
  **Depends on:** 17.4, 19.1.

- [ ] **18.3** Fix errors and save a corrected copy with re-run —
  Add the correction dialog with editable flagged cells,
  Save & re-run [function] and Cancel. Validate edits, create a new
  linked corrected input, select it and run the chosen function.
  Preserve the original and existing results. If processing fails
  after saving, retain the corrected input and retry without
  duplicating it.
  **Depends on:** 18.1, 18.2.

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
