# Fix: Split the large client components into smaller readable pieces

**Type:** Fix
**Status:** verified
**Branch:** chore/split-large-client-components

## The problem

After #54 organized `client/src` into folders, three files still do several jobs at
once, which makes them hard for a junior developer to read:

| File | Lines | What it mixes |
|---|---|---|
| `pages/ArchitecturePage.tsx` | 493 | All page text and data, six sections' markup, the tech tiles, the diagram and small helpers |
| `components/CompareWorkspace.tsx` | 358 | The dialog shell plus five chart and table pieces and their shared styles |
| `pages/FilesPage.tsx` | 267 | Page state and wiring plus the filter card, the selected-files toolbar, banners and the archive toast |

## The fix

Move code into smaller files, one component per file, named after what it shows.
No behaviour, text or styling changes; no new dependencies.

- **Architecture page** → `components/architecture/`:
  - `content.ts`: the page's data (`TECH`, `PIPELINE`, `HOW_IT_WORKS`, the decisions,
    storage options, evolution items and section list).
  - `Section.tsx` plus shared bits (`Checks`, `Path`, card style).
  - One file per section: `OverviewSection`, `TechStackSection`, `ArchitectureSection`
    (diagram and "How it works"), `DecisionsSection`, `StorageSection`, `EvolutionSection`.
  - `pages/ArchitecturePage.tsx` keeps only the page frame (navigation, header, "On this
    page" links) and lists the sections in order.
- **Comparison** → `components/compare/`: `CompareWorkspace.tsx` (the dialog, tabs and
  state), `Overview.tsx`, `RowChart.tsx`, `CategoryChart.tsx`, `SummaryByFile.tsx`,
  `RowDifferences.tsx`, and `styles.tsx` for the shared colours, `Dot`, card and pill styles.
  Also apply the pending `max-h-[32rem]` → `max-h-128` (same 32rem).
- **File workspace**: move the filter card to `components/FileFilters.tsx`, the
  selected-files toolbar to `components/SelectionBar.tsx`, the archive toast to
  `components/ArchiveToast.tsx`, and the green/red message boxes to
  `components/Banner.tsx`. `GeneratorPage` uses `Banner` too, instead of its own copy.
- Props are passed explicitly (no context, no new state); each new component gets a
  one-line doc comment saying what it shows.
- Update the paths in `CLAUDE.md`, the coding standards, the README layout and the
  Architecture page's technology file lists, plus the content test if a quoted file moves.

## Build steps

- [x] **1. Architecture page.** Split as above; tests import page data from
  `components/architecture/content.ts`.
  *Done when:* the Architecture page and content tests pass unchanged apart from imports.
- [x] **2. Comparison.** Split `CompareWorkspace` as above.
  *Done when:* the file workspace tests (which cover comparison) pass unchanged.
- [x] **3. File workspace and banners.** Extract the four components; use `Banner` in
  both pages.
  *Done when:* the file workspace and generator tests pass unchanged.
- [x] **4. Docs.** Update every doc that names a moved path.
  *Done when:* no current doc names an old path, and `npm run verify` passes with the
  same test counts (server 231, client 141).

## Verify

- `npm run verify`: server tests, client tests (same 141, only imports change),
  type-check and build.
- Not checked in a real browser: markup and classes are moved, not changed.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":3364,"specSha256":"0481cc158751a1fc5707298042700d9f7c72cd898a0a47037111e322ab084659","branch":"refs/heads/chore/split-large-client-components","head":"e0edb8b839e712f497675232f923afe62502090d","baseRef":"refs/heads/main","baseCommit":"e0edb8b839e712f497675232f923afe62502090d","sourceTree":"6765bca74fc3c065d1e0fb8949df49cdc4781395","landing":"pull-request","absentOptional":[]} -->
