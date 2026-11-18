# Vercel deployment

Status: since 16.3 (2026-11-17), Vercel serves Reclaim Studio as **one static
site**, with no server, API or cloud storage. The Vercel project is the Test
site: it deploys `main` and PR Previews.

History: the person confirmed an optional Vercel deployment on 2026-11-06 (PR
#6), first as two services (a Vite `client` and a Fastify `server` on `/api`)
with private Vercel Blob storage. The Blob store reached the Hobby plan's usage
limit on 2026-11-17, so milestone M16 moved every file action into the browser
(16.1, 16.2) and 16.3 retired the server and Blob. The earlier setup is in this
file's Git history and `blueprint/build-plan-archive.md`.

## Build and routing

Import the repository with the **repository root** as the Vercel project root.
`vercel.json` sets:

- `installCommand`: `npm ci` (both workspaces, from `package-lock.json`);
- `buildCommand`: `npm run build -w client` (type-check and Vite build);
- `outputDirectory`: `client/dist`;
- `framework`: `vite`.

There are no rewrites and no functions. The build copies `index.html` to
`client/dist/generator/` and `client/dist/architecture/`
(`client/src/lib/pages.ts`), so `/generator` and `/architecture` load directly.
The five sample CSVs are bundled into the JavaScript at build time.

## Where files are kept

Each visitor's uploads, results and archive flags stay in their own browser
(IndexedDB, or memory when the browser blocks it; see
`client/src/lib/browser-storage.ts`). Nothing is sent to Vercel, and visitors
never see each other's files. The page says files can be lost when browser
data is cleared, and **Clear my data** resets them to the five samples.

## Settings

Only one build variable is read:

| Variable | Where | Effect |
| --- | --- | --- |
| `APP_ENV_LABEL` | Production environment, `Test` | The navigation label reads `vX.Y.Z · Test`. Previews show `· Preview` without it. |

## Clean-up in the Vercel dashboard (the person)

These are no longer read by anything and can be removed in the Vercel
dashboard. Nothing in the repository depends on them, and removing them is not
part of a code change:

- the private Blob store attached to the project, and its data (fictional demo
  files only; they are not moved into browsers);
- the environment variables `BLOB_READ_WRITE_TOKEN`, `RECLAIM_BLOB_PREFIX` and
  `MAX_UPLOAD_MB`.

## Limits

- Uploads are limited to 10 MB per CSV (`UPLOAD_MAX_MB` in
  `client/src/lib/api.ts`), checked in the browser. No request reaches Vercel,
  so its 4.5 MB function body limit no longer applies.
- A comparison holds at most 50,000 rows across its files (`COMPARE_MAX_ROWS`),
  so the page stays responsive.
- How much a browser stores depends on the browser and free disk space. When it
  is full, the app says so and suggests downloading results and clearing data.

## Checking a deployment

Open `/`, `/generator` and `/architecture`, upload a CSV, process, preview,
compare and download it, then refresh and see the files are still there. The
browser's Network tab shows no `/api` requests. A PR's Vercel Preview is the
first real check of a `vercel.json` change; the repository's tests do not
exercise Vercel.

## Releases and environments

Added in 12.2 (2026-11-14).

- **Test:** this Vercel project. It deploys `main` (Vercel calls that
  environment Production) and PR branches as Previews.
- **Production:** not decided. No production branch, repository or host is
  configured, and nothing deploys automatically.
- **Release zip:** when a GitHub Release is published,
  `.github/workflows/release-artifact.yml` builds from the exact tag:
  - it runs `npm run verify`;
  - `scripts/build-release.mjs` zips only the files in `release/allowlist.txt`
    that are tracked at the tag, refusing planning, tooling, workflow, script
    or secret paths and token-like text;
  - it installs and builds the unzipped copy, and checks that the three pages
    and the bundled sample files are in the build;
  - it attaches `icorium-vX.Y.Z.zip`, `icorium-vX.Y.Z.zip.sha256` and
    `icorium-vX.Y.Z.manifest.json` to the release.

  "Run workflow" with a tag rebuilds an existing release's assets. Only
  releases that include the release tooling (`scripts/build-release.mjs` and
  `release/allowlist.txt`, added in 12.2) can be built, since the build runs
  from the tag itself. Building the same tag gives the same zip.
- **Deploying a release:** download the three assets from the GitHub Release,
  check them with `sha256sum -c icorium-vX.Y.Z.zip.sha256`, unzip, and follow
  `DEPLOY.md` inside: Node 24, `npm ci`, `npm run build -w client`, then serve
  `client/dist` from any static host.
- **Artifact contract:** the build job's only output is the workflow artifact
  `release-icorium-vX.Y.Z` holding those three files. A future job that
  publishes to another repository or host should consume that artifact rather
  than rebuild.

References: [vercel.json](https://vercel.com/docs/project-configuration),
[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
