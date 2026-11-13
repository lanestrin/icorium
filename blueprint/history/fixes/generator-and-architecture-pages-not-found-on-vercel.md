# Fix: Generator and Architecture pages not found on Vercel

**Type:** Fix
**Status:** verified
**Branch:** `fix/generator-and-architecture-pages-not-found-on-vercel`

## The problem

On the Vercel deployment, `/generator` (CSV Generator) and `/architecture`
(Architecture & Tech Stack) return "not found". Locally they work. The person
reported this on 2026-11-13 after publishing online.

- The app is one HTML page. `client/src/App.tsx` reads `window.location.pathname`
  and picks the page, and it already ignores a trailing slash.
- Locally, the Vite dev and preview servers answer every path with
  `index.html`, so both pages load.
- On Vercel, `vercel.json` sends every non-`/api` path to the static client
  service, which serves `client/dist`. That folder only has `index.html` at the
  root, so `/generator` and `/architecture` match no file.
- The nav links are plain `<a href>` links, so clicking them fails the same way
  as typing the address.
- `README.md` already lists direct access on Vercel as unverified.

## The fix

Make the client build write a copy of the built page for each client-side
page: `dist/generator/index.html` and `dist/architecture/index.html`, each
byte-for-byte equal to `dist/index.html`. Static hosts, Vercel included, serve
a folder's `index.html` for that folder's path. The copies load the same
`/assets/...` files because Vite's default `base: '/'` makes asset URLs
absolute.

- Keep the page paths in one place, `client/src/lib/pages.ts`: export the list
  of extra page paths (`/generator`, `/architecture`). `App.tsx` and the build
  both read it, so a new page can't be routed in the app but missing from the
  build.
- Put the build step in that same module as a small Vite plugin, using only
  Vite's own API (`generateBundle`, which emits a copy of the built
  `index.html` source as a new asset). No new dependency, no Node `fs` calls.
  `client/vite.config.ts` adds it to `plugins`.
- Must not break:
  - `npm run dev`, which still answers every path with the SPA page.
  - `/api` routing in `vercel.json`, which is unchanged.
  - The root page.
  - Assets, which still load once from `/assets/`.
- Not changing: `vercel.json`, the links themselves, and any router library.
  An unknown path still gets the host's 404.

## Build steps

- [x] **Step 1 - One list of pages, copied at build time** - Add
  `client/src/lib/pages.ts` with the page path list and the plugin. Use the
  list in `App.tsx` and register the plugin in `client/vite.config.ts`. Add
  `client/src/lib/pages.test.ts`. It calls the plugin's `generateBundle` with a
  fake bundle holding an `index.html` asset and checks that one copy is emitted
  per page at `generator/index.html` and `architecture/index.html`, with the
  same source. It also checks that nothing is emitted when the bundle has no
  `index.html`. Keep the existing App/page tests passing. *Done when:* the unit
  test passes, and `npm run build -w client` leaves `client/dist/generator/index.html`
  and `client/dist/architecture/index.html` identical to `client/dist/index.html`.
- [x] **Step 2 - Docs** - Replace the README limitation line with what the
  build now does, and note that it still needs confirming on the live
  deployment. Add `client/src/lib/pages.ts` to the Vite card's `files` in
  `client/src/components/architecture/content.ts`, and adjust its wording if
  it describes page routing. `architecture-content.test.ts` checks the named
  paths exist. *Done when:* `npm run verify` passes.

## Verify

- `npm run verify` (server and client tests, type-check, build).
- After the build, compare the three HTML files in `client/dist`. They must be
  identical.
- Not verifiable here: the live Vercel behavior. After merge and deploy, open
  `<deployment>/generator` and `<deployment>/architecture` directly and click
  each nav link. Both pages should load, not 404. If Vercel redirects to
  `/generator/`, the page still loads because `App.tsx` ignores trailing
  slashes.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":3980,"specSha256":"9b4138a8968c22b385a45d0d1a7295d8c8bb8bcd127def80cf8a8f3725a6818f","branch":"refs/heads/fix/generator-and-architecture-pages-not-found-on-vercel","head":"179735c4fc74f4d8b011884623faaa2e90fa39c7","baseRef":"refs/heads/main","baseCommit":"179735c4fc74f4d8b011884623faaa2e90fa39c7","sourceTree":"748e1dbe4dae871dad950f81cc579cb10e877062","landing":"pull-request","absentOptional":[]} -->

## Try it now

Run or do (PowerShell, from the project root):

```powershell
npm run build -w client; Get-FileHash client/dist/index.html, client/dist/generator/index.html, client/dist/architecture/index.html | Select-Object Hash, Path
```

Expected:

The build ends with `✓ built in …` (after the existing large-chunk warning), then three rows, `clientdistindex.html`, `clientdistgeneratorindex.html` and `clientdistarchitectureindex.html`, all with the same **Hash**.

This proves:

The client build now writes a copy of the app page for `/generator` and `/architecture`, the files a static host such as Vercel needs to serve those addresses instead of "not found". The live deployment still has to be opened at both addresses to confirm it.
