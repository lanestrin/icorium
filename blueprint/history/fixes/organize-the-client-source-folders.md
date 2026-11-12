# Fix: Organize the client source folders

**Type:** Fix
**Status:** verified
**Branch:** chore/organize-client-src

## The problem

`client/src` mixed pages, the router, every hook, the API client, pure rules and all tests
in one flat folder, with two pages filed under `components/`. The person asked for a
standard, readable layout a junior developer can follow ("clean code"): a hooks folder,
pages in their own folder, and a layout folder only if needed.

## The fix

Move files and split two of them; no behaviour changes.

| Folder | Holds |
|---|---|
| `src/App.tsx` | Only picks the page from the URL (was `Root`); `main.tsx` renders it |
| `src/pages/` | `FilesPage` (the file workspace, was `App`), `GeneratorPage`, `ArchitecturePage`, each with its tests |
| `src/components/` | Shared UI pieces: `Sidebar`, `FileTable`, `CompareWorkspace`, `Modals` |
| `src/hooks/` | One hook per file, named after it: `useFileList`, `useSelection`, `useFilters`, `useArchive` (with `TOAST_MS`), `useProcessing`; `hooks.test.ts` |
| `src/lib/` | Pure code: `api`, `file-status`, `compare-view` (comparison rules moved out of `CompareWorkspace`), `format` (`errorMessage`, `plural`, `Report`), each with its tests |

- Tests sit next to the file they test (Vitest already includes `src/**/*.test.{ts,tsx}`).
- `errorMessage` and `plural` replace three copies of `msg` and two of `plural`. The
  generator's `plural(n, word)` and the workspace's `plural(n)` become one
  `plural(n, word = 'file')`; counts of 1,000 or more now read "1,000 files".
- `useSelection` is written out step by step with named variables.
- No layout folder: the pages share no wrapper today, so one would be speculative.
- Docs and the Architecture page name the new paths (`CLAUDE.md`, coding standards,
  README layout, test table and settings row, and the page's technology file lists).
  The content test's repository globs follow it into `pages/`.

## Build steps

- [x] **1. Move, split and rename.** Move the files with `git mv`; rewrite every relative
  import and `vi.mock` path; split `hooks.ts`; move the comparison helpers into
  `lib/compare-view.ts`; add `lib/format.ts`; make `App.tsx` the router and
  `pages/FilesPage.tsx` the workspace; update the tests' imports and names.
  *Done when:* the type-check is clean and all client tests pass unchanged in number.
- [x] **2. Docs.** Update every document that names an old path.
  *Done when:* no current doc names a moved file's old path, and `npm run verify` passes.

## Verify

- `npm run verify`: server tests, client tests (141, unchanged in number), type-check and build.
- Not checked in a real browser; behaviour is unchanged and covered by the component tests.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":2705,"specSha256":"d9ee53b29e857ae38cde35946e743056e525b1f4397b6889fbc15fd339e3710e","branch":"refs/heads/chore/organize-client-src","head":"78599f7c77e745fcb981bcf774c49d44ad38cb30","baseRef":"refs/heads/main","baseCommit":"78599f7c77e745fcb981bcf774c49d44ad38cb30","sourceTree":"e45b9da3298db710bd1352d8e4c93301ec96a83a","landing":"pull-request","absentOptional":[]} -->
