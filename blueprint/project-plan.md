# Reclaim Studio — Project Plan

## 1. Problem and desired outcome

Reclaim Studio began as Icorium’s full-stack interview exercise: a
non-technical user imports partner refrigerant data, processes every row,
exports results preserving source columns, and compares results visually.

The completed demonstration uses synthetic data. Classification rules are
demo-only; the application is not a production chemical-engineering system.

The next milestone turns the existing application into an invitation-only
prototype with sign-in and private workspaces available across devices.
Users land directly in the existing file workspace after signing in.

Keep the interface simple and the architecture proportional. Add services
only for agreed requirements. Do not build a separate overview dashboard
of counts, charts or activity before there is a demonstrated need.

## 2. Users and access

### Initial audiences

- Invited individual users with private workspaces.
- The initial administrator: the project owner.
- Guests trying the workflow through an isolated demo session.

Internal teams and separate customer organizations are later audiences.
Their collaboration and permissions are not part of this milestone.

### Initial roles

Admin:
- Invite users and assign Admin or Member access.
- Manage pending invitations.
- Change roles and deactivate/reactivate accounts.
- Access the Architecture page and CSV Generator.
- Use a private file workspace.
- Cannot access another user’s file contents.

Member:
- Use their own private workspace.
- Upload, preview, process, download, compare, archive, restore and delete
  their own files.
- Correct validation-flagged input cells.
- Cannot use account administration or developer pages.

Admin and Developer are one role initially. Separate developer visibility
controls, custom roles and a permission builder are deferred.

The project owner is the sole initial Admin. Additional Admin access can
be assigned deliberately later.

Demo sessions:
- Exercise the login form using credentials filled by a Try the demo link.
- Require the guest to submit the login form.
- Receive separate temporary browser workspaces seeded with sample data.
- Cannot access cloud workspaces, administration or developer pages.
- Cannot affect another guest’s files.

An Admin’s account-management permissions never imply permission to read
another user’s private files.

## 3. Existing capabilities and next milestone

### Completed demonstration

Preserve the shipped behavior and completed feature history:

- Partner CSV parsing, schema detection and preview.
- Excel, text-PDF, scanned-PDF and image conversion in the browser, with
  review before import.
- Three processing functions:
  Composition Validation, Component Mass Calculation and Batch
  Classification.
- Shared validation, invalid-row preservation, Needs Review status and
  data-quality warnings.
- Result exports retaining original columns and appending generated ones.
- File workspace filters, sorting, Active/Archived tabs and archive/restore.
- Comparison of 2–5 compatible results.
- Stable File IDs carried in CSV data.
- Explicit confirmation before replacing an existing result.
- CSV Generator and Architecture pages.
- Responsive UI, component stories and automated verification.

### Next milestone

1. Required sign-in, with email/password and Google sign-in.
2. Invitation-only account activation.
3. A small Admin page for invitations, roles and account access.
4. Private cloud files and results available across devices.
5. A separate temporary browser demo.
6. Permanent deletion of selected files.
7. Editing validation-flagged input cells and saving a corrected copy,
   with a direct re-run action.

Before items 3–7 above: universal file ingestion (M19, section 14),
decided 2026-11-20.

Routine UI and implementation choices should use the simplest existing
pattern. Ask for decisions only when they materially affect behavior,
privacy, data loss, interoperability or cost.

## 4. Identity, invitations and account lifecycle

### Invitations

Admin enters:
- Email address.
- Role: Member by default, or Admin.

Admin does not create or know the recipient’s password.

The recipient follows the invitation email, supplies their name and
finishes setup using a password or Google sign-in.

The invitation must be bound to its intended email address. Google
sign-in does not bypass invitation-only access.

Follow the agreed Slack-style lifecycle:
- Invitations expire after 30 days.
- Admin can resend, extend or delete a pending invitation.
- Deleting an invitation prevents acceptance.
- Accepted invitations cannot be reused to create another account.

Show clear pending, accepted, expired and revoked states. Report email
delivery failures without claiming the invitation was delivered.

The detailed handling of resend/extension tokens belongs in the feature
spec and must preserve expiry and revocation guarantees.

### Account lifecycle

- Include sign-out and password recovery through the chosen identity
  provider.
- Deactivation blocks further application access, including access from
  an already signed-in session.
- Retain a deactivated user’s files.
- Reactivation restores access.
- Do not add permanent account deletion in this milestone.
- Prevent accidental removal of the last active Admin’s ability to
  administer the application.

Role checks and deactivation must be enforced by trusted services, not
only by hiding navigation.

### Deferred support access

A future Admin capability may grant troubleshooting access to a specific
user’s files. It is not built now.

Before implementation, define authorization, visibility to the affected
user, recording of access and how access ends.

## 5. Data, privacy and file identity

### Registered users

Files and results belong to the authenticated user and persist in cloud
storage across devices.

Enforce ownership for every file operation:
- Listing and metadata.
- Upload and creation.
- Preview and download.
- Processing and replacement.
- Comparison.
- Archive and restore.
- Correction and permanent deletion.

Do not trust a user-supplied owner ID. Derive identity from the verified
session. A user must not access another person’s files by guessing IDs
or calling an endpoint directly.

File content remains private from Admin in this milestone. Account
administration should expose only the account information needed to
manage access.

### Existing data contracts

Preserve:
- File ID, filename and processing function as separate concepts.
- Original input values and columns in processed exports.
- Function suffixes -V, -M and -C.
- Explicit replacement confirmation.
- Imported-result recognition and provenance behavior.
- File operations addressed by ID, never by filename.
- Existing partner formats and processing rules.

Cloud identity needs an explicit allocation and ownership contract before
implementation. Existing six-digit IDs may repeat across independently
created browser workspaces; never assume they are globally unique.

Resolve how owner-scoped IDs, exported CSV IDs and imported-result linking
interact before building cloud upload. Preserve the distinction between
a linked source and unverified provenance.

Do not silently change the completed demo’s identity guarantees.

### Existing browser files

No automatic migration.

Provide a way to export pre-existing browser files before users lose
access to them. Users manually upload desired files into their signed-in
workspace.

Never silently upload browser files into whichever account signs in.
Demo cleanup must not erase pre-existing browser data.

### Temporary demo data

Guest files remain in a browser-only workspace, separate from registered
cloud files and pre-existing local data.

End the demo session on sign-out and discard that session’s temporary
data. Demo data does not consume cloud file storage.

The implementation must define session isolation across tabs and browser
refreshes without introducing a shared mutable demo account.

The autofilled demonstration credentials are public demonstration data,
not credentials granting access to a real member or Admin account.

## 6. Permanent file deletion

Members and Admin can permanently delete files in their own workspaces.

- Require explicit confirmation identifying the selected file.
- Explain that deletion is permanent.
- Deleting an input keeps its existing results.
- Kept results remain available for preview, download and comparison.
- Mark their source as deleted; do not present a working source link.
- Deleting a result leaves its input and other results unchanged.
- Archive/Restore remains available for reversible removal.

Remove the selected stored content and associated active metadata
consistently. Failed deletion must produce clear feedback and must not
be reported as successful.

Define how source provenance and corrected-copy relationships survive a
source deletion. Keep no extra copy of deleted file contents merely to
support those labels.

Do not promise immediate erasure from a provider’s backups unless the
chosen provider actually supports that guarantee.

## 7. Correcting invalid data

### Editing scope

Only validation-flagged cells in original input files are editable.
Other input cells and all generated result cells remain read-only.

The implementation must identify editable cells from structured
validation evidence. Do not infer fields by parsing display error text.

Some existing validation failures may apply to a row or several columns.
Before implementation, define how these identify the affected editable
cells. Problems that cannot be repaired through cell editing must remain
clearly explained.

### Correction flow

1. Open Fix errors on a file with validation problems.
2. Highlight affected cells and their errors.
3. Edit the flagged cells.
4. Validate the corrections.
5. Save a new corrected input and re-run the chosen processing function.

Actions:
- Save & re-run [function].
- Cancel.

Use the function associated with the result from which correction was
opened, or the selected workspace function when starting from an input.
Show the function in the action label.

Invalid corrections keep the dialog open with clear field feedback.

A corrected input:
- Receives a new File ID.
- Preserves all unedited source values and columns.
- Identifies the original input through a “Corrected from [File ID]”
  relationship.
- Leaves the original and its results unchanged.
- Becomes selected automatically after saving.

Cancel before submission discards edits without creating files or
starting processing.

Saving the corrected input and producing a result are distinct outcomes.
If saving succeeds but processing fails, retain the corrected input,
explain what succeeded and offer retry without creating another copy.
Do not promise cancellation can undo an already stored file.

## 8. Technology and architecture

### Preserve the working foundation

- React 19, TypeScript and Vite.
- SCSS Modules and existing design tokens.
- Existing shared UI components and Radix interactions.
- Recharts, Papa Parse and Zod.
- Existing browser conversion libraries.
- Shared processing and file-service logic.
- Vitest and React Testing Library.
- Existing CI and release tooling.

Keep current prototype file, page and processing limits.

Processing and conversion remain in the browser for this milestone.
Do not introduce server jobs, queues or managed OCR.

### New service responsibilities

Use managed services for:
- Identity and sessions.
- Persistent metadata and private file storage.
- Invitation and account-related email delivery.

Choose one implementation for each responsibility. A single provider
may cover several responsibilities when it meets the requirements.

Keep UI, identity checks, file storage and email delivery cohesive and
separate where their responsibilities differ. Reuse the existing storage
interface where appropriate.

Add server-side functions only where trusted secrets or privileged
operations require them. Never put administrative credentials in the
client.

Do not build:
- Multiple provider implementations in advance.
- A generic plugin system.
- Microservices.
- A generalized authorization framework.
- A separate reporting dashboard.
- Background processing infrastructure.

### Provider-selection prerequisite

No provider is selected by these drafts.

Before implementation, verify current official documentation for:
- Free-plan availability and limits.
- Email/password and Google authentication.
- Invitation-only activation.
- Email delivery, sender configuration and recovery emails.
- Private file access and ownership enforcement.
- Deactivation and session invalidation.
- Storage/download limits and behavior when limits are reached.
- Availability of existing files at capacity.
- Upgrade and data-export paths.
- Required account setup, domains or payment-card requirements.

Record the supported design and any conflicts before implementation.
Do not assume free plans offer uninterrupted access when limits are hit.

## 9. Cost, capacity and deployment

Free-only during the prototype phase.

At capacity:
- Pause affected new uploads or invitations.
- Show an actionable explanation.
- Preserve existing stored data.
- Existing files must remain accessible under the selected service’s
  documented limits.

If no free service combination satisfies the access requirement, report
the conflict before building. Do not silently relax the requirement or
enable billing.

Retain Vercel static hosting where it fits the selected architecture.
Any additional services and trusted functions require explicit planned
scope. This plan does not authorize provisioning accounts, sending
invitations, deployment or paid services.

Provide a practical path to increase capacity or replace a provider
through documented configuration and export procedures, without building
unused alternatives now.

## 10. UI and accessibility

Use the existing restrained, Apple-inspired visual language:
- Existing tokens, typography, spacing and shared components.
- One app header and left navigation, as in the reference images in
  `blueprint/reference/` (sign-in page, header and sidebar; added
  2026-11-23). No notifications and no extra dashboard pages: the
  navigation opens existing screens.
- Responsive phone layouts without sideways page scroll.
- Accessible forms, validation messages, keyboard interaction and focus.

Primary screens:
- Sign-in, with email/password, Google sign-in and Try the demo
  (build-plan 17.8).
- Invitation acceptance and password recovery.
- Existing file workspace, shown as "Dashboard", the signed-in landing
  screen, with the app header and navigation (build-plan 17.9).
- Admin user and invitation management.
- Existing Architecture and Generator pages, restricted to Admin.
- Existing preview/review patterns extended for corrections and deletion.

Distinguish real saved cloud workspaces from temporary demo sessions
clearly. Avoid exposing implementation details unless they help users
make a meaningful choice.

## 11. Verification and success criteria

Preserve existing automated coverage and run npm run verify for finished
work items.

Add meaningful coverage for:
- Invitation acceptance, expiry, revocation and failures.
- Both sign-in methods and invitation-only restrictions.
- Admin/Member access and cross-user isolation.
- Deactivation of already signed-in users.
- Private upload, preview, download and comparison.
- Persistence across devices using the chosen hosted services.
- Demo isolation and cleanup.
- Deletion while preserving results.
- Flagged-cell validation, corrected copies and re-run failures.
- Capacity refusals without loss of existing files.

Mocks do not prove hosted authentication, cross-device persistence,
real email delivery or browser layout. Verify those through direct
evidence against a non-production setup when available.

Do not introduce a browser test harness without separate approval.
Do not claim unperformed integration or visual checks passed.

Success:
- An invited person activates an account and reaches their workspace.
- Their files and results are available from another signed-in device.
- Other users and Admin cannot read their file contents.
- Admin can manage invitations and account access.
- Guests can safely demonstrate the workflow.
- Users can delete selected files and correct flagged data simply.
- The prototype operates within the agreed free-only constraints.

## 12. Deferred scope

- Internal teams and customer organizations.
- Sharing between users and cross-partner collaboration.
- Separate Developer roles and custom permissions.
- Per-user Admin troubleshooting access.
- Billing, licensing and paid infrastructure.
- Large-file processing, queues and server workers.
- Managed document AI and AI-assisted document interpretation
  (deterministic ingestion is in scope in section 14).
- Automatic migration of existing browser files.
- Permanent account deletion.
- Extra overview dashboards without a demonstrated use.

The earlier proposed production-platform direction remains a long-term
possibility, not authorization to build these deferred capabilities.

## 13. Open technical decisions

Resolve in the provider/design prerequisite or the relevant feature spec:
- Managed provider(s), free capacity and service-limit behavior.
- Initial Admin bootstrap.
- Cloud File ID namespace and imported-result ownership/provenance.
- Structured mapping of validation issues to editable cells.
- Existing browser-data export and demo-session isolation details.
- Required hosted verification setup.

Preserve these as explicit decisions; do not substitute assumptions.

## 14. Universal file ingestion (M19)

Decided by the person on 2026-11-20, from the "Universal File Ingestion,
Intelligent Column Mapping & Data Validation" brief. Built before 17.3.

### Outcome

Supplier files in CSV, Excel, PDF or supported image form can be imported
whatever their column names or layout. A file may be uploaded without
being approved for processing; a field may be recognised without being
verified; a value may be extracted without being reliable. The app keeps
these distinctions and calculates only from mapped, unit-verified,
validated data that traces back to its source.

### Requirements

- **Mapping:** exact partner schemas first, then normalized headers
  (case, whitespace and separators folded, units kept), then known
  aliases, then manual mapping. Columns may stay unmapped. Each
  essential field needs exactly one approved source column; ambiguities
  and collisions are reported, never resolved by picking the first.
  Optional supplier mapping profiles suggest, but never override
  contradicting evidence in a new file.
- **Units:** taken from an explicit column unit, document metadata, an
  approved supplier profile or user confirmation. Value ranges only warn
  (0.40 may be 0.40% or 40%). Mass in kg, lb or g; composition as percent
  or fraction; normalized to kg and percent with every factor recorded.
  Unsupported or unverified units block processing.
- **Validation:** one shared module for every file type, with blocking
  errors, warnings and information. Schema, numeric, record and source
  integrity are checked, including ambiguous decimal or thousands
  separators and lost minus signs. The existing 0.5-point composition
  tolerance and the demo rules and formulas stay.
- **Excel:** every sheet, candidate tables with headers below
  introductory rows, header, data, total and note rows told apart,
  duplicate or missing headers, formula values flagged; the user chooses
  between several tables, which are never merged.
- **PDF and OCR:** page numbers and positions kept, repeated headers
  across pages, misalignment, missing or extra cells, OCR confidence, and
  ambiguous characters (0/O, 1/I, 5/S, lost decimals or signs, digits in
  the wrong column) flagged for confirmation, never corrected silently.
- **Review:** an import review step shows the table, headers, suggested
  mapping, units, sample values, row counts, blocking errors and warnings,
  lets the person correct the mapping, and explains any block. Ingestion
  states: Needs Mapping, Needs Review, Ready for Processing, then the
  existing Processed.
- **Traceability:** each result records its input File ID, source type,
  sheet or page, row and column, raw value, mapping, unit, conversion,
  validation decision and processing function version. The original
  source file is kept. Exported CSV columns and File IDs stay unchanged.

### Decisions (the person, 2026-11-20)

1. **Order:** M19 is built after 17.2 and before 17.3.
2. **Enforcement:** the processing gate lives in `shared/file-service.ts`,
   the only API every caller uses, so a direct or modified request cannot
   bypass it. There is no server (retired in 16.3) and none is added;
   trusted enforcement arrives with cloud files in 17.4. This is a
   recorded limitation.
3. **Bad rows:** a blocking row error excludes that row: it gets no
   calculated value and never a zero. The exclusion is disclosed in the
   result and comparison, and totals are labelled as covering only the
   valid rows. File-level problems (an unmapped essential field, an
   unconfirmed unit, unresolved extraction uncertainty) block the whole
   file.

### Acceptance

1. Existing partner files work without regression.
2. A supplier CSV with unfamiliar headers can be mapped and validated.
3. An Excel file with data on a later sheet imports correctly.
4. A PDF with an identifiable table can be extracted and reviewed.
5. Unknown or conflicting units prevent calculation.
6. Ambiguous OCR results are flagged, not accepted silently.
7. Missing required measurements block the affected calculations.
8. Validated data uses the existing calculation functions.
9. Every calculated output traces to its source data.
10. Comparison and File ID conventions keep working.
11. Direct calls to the file service cannot bypass validation.
12. Automated tests cover the supported file types and critical failures.

### Non-goals

No rewrite of the app, new formulas, required supplier header names, AI
or external services, guessed units, invented values, edited source
files, warnings hiding blocking errors, removed partner formats, or UI
redesign unrelated to ingestion safety.
