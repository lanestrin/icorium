# Fix: Readable client styles and components

**Type:** Fix
**Status:** verified
**Branch:** chore/readable-styles

## The problem

The person found the client hard to read: JSX full of long Tailwind `className` strings
(about 100 strings of 60+ characters across 20 files), repeated styling patterns
(cards, buttons, table headers, links), and several components that still mixed many
jobs (`Modals.tsx`, `FileTable.tsx`, `GeneratorPage.tsx`, the comparison dialog). They
asked for a readability refactor that keeps Tailwind, moves complex styling out of the
JSX, organizes components by feature and changes nothing a person can see or do.
They also asked for the file preview dialog to be wider: at 1152px it left wide CSVs
scrolling sideways with room to spare on the screen.

## The fix

- **Styling architecture:** `src/index.css` imports Tailwind and `src/styles/`:
  `tokens.css` (`@theme`: page font and background, previously hardcoded), `base.css`,
  `components.css` (shared `@layer components` classes: `page-shell`, `card`, `btn`,
  `btn-primary`, `btn-secondary`, `nav-link`, `page-nav`, `eyebrow`, `code-chip`,
  `table-head-row`, `table-row`, `dismiss-button`) and `menu-select.css`.
- **CSS Modules per feature** (`@reference "tailwindcss"` + `@apply`, the same utilities as
  before): `files.module.css`, `compare.module.css`, `modals.module.css`,
  `generator.module.css`, `architecture.module.css`, `ArchitecturePage.module.css`,
  `Banner.module.css`. Short utilities stay inline. `lib/class-names.ts` joins classes.
- **Feature folders in `components/`:** `files/` (Sidebar, FileFilters, FileTabs,
  SortMenu, FileTable, RowMenu, StatusBadge, SelectionBar, ArchiveToast), `compare/`
  (adds SelectedFiles and CompareToolbar; `styles.tsx` → `fileColors.tsx`), `modals/`
  (Modal with a `useDialogFocus` hook, RunConfirmations, PreviewModal), `generator/`
  (NumberField, ChoiceOption, GeneratedFileList, GeneratedFilePreview), `architecture/`.
- **Simpler JSX:** named handlers (`selectMetric`), small subcomponents for repeated or
  nested markup (`Stat`, `TopDifferencesTable`, `SortableHeader`, `DropZone`,
  `ProblemRows`, `RowsTable`, `DecisionCard`, `StorageOptionBox`), and computed values
  pulled out of JSX (`batchSummary`, `previewSubtitle`, labels). Pure helpers move to
  `lib/` (`generated-files.ts`, `rowsWord` in `format.ts`).
- **Wider preview dialog:** the default (non-narrow, non-full) dialog size, used only by
  the file preview, goes from `max-w-6xl` (1152px) to 1400px, the same cap as the Compare
  dialog. The narrow confirmations are unchanged.
- Tests that asserted raw utility classes now assert the module class
  (`styles.section`, `styles.flaggedRow`, `styles.errorCell`).
- Docs: `CLAUDE.md`, the coding standards (new styling rules) and the README layout; the
  Architecture page's Tailwind tile describes the new approach.
- Unchanged: behaviour, text, data flow, accessibility attributes and the classes each
  element ends up with, apart from the preview width and the shared `btn` class noted
  under Verify.

## Build steps

- [x] **1. Styles foundation.** `styles/`, `class-names.ts`.
- [x] **2. Comparison.** Module styles, SelectedFiles, CompareToolbar.
- [x] **3. Architecture page.** Module styles and subcomponents; divider test via module class.
- [x] **4. Generator.** Feature folder, helpers to `lib/`, highlighted-row test via module class.
- [x] **5. Dialogs.** `modals/` split; error-cell test via module class.
- [x] **6. File workspace.** `files/` folder, SortMenu, page layout classes.
- [x] **7. Docs.** Paths and styling standards.
- [x] **8. Wider preview dialog.** `panelWide` (1400px) and `panelNarrow` in `modals.module.css`.
  *Done when:* `npm run verify` passes with the same test counts (server 231, client 141).

## Verify

- `npm run verify`: server 231, client 141, type-check and build. Built CSS checked for
  breakpoints, hover and focus variants, nested `th`/`td` rules, `:first-of-type` and the
  1400px preview width.
- Not checked in a real browser: visual equivalence has not been confirmed. Known small
  differences: the generator's "Add to CSV Files" button uses the shared `btn` class,
  which adds `transition` (a 150 ms hover fade); `btn` also adds `justify-center`, which
  has no visible effect on content-sized buttons.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4327,"specSha256":"d810d13eee71685ab6fa556f341a9b4f7f8916cc2582f1ff0ff7d7a26e416012","branch":"refs/heads/chore/readable-styles","head":"6ef2f57c8ed1d98d4d490e1606e7692027109535","baseRef":"refs/heads/main","baseCommit":"6ef2f57c8ed1d98d4d490e1606e7692027109535","sourceTree":"a54ac2269a4bd1c6e684dc86ef44b9f41ec92135","landing":"pull-request","absentOptional":[]} -->
