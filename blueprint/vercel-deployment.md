# Vercel multi-service deployment

Status: repository configuration prepared; service/routing/storage choices
confirmed by the person on 2026-11-06. No project, store or deployment has been
created. Confirmation covers the configuration, not Git publication or deployment.

Confirmed: service names `client` and `server`; public server paths `/api` and
`/api/*`; public client catch-all; no internal-only service or service bindings;
private Vercel Blob with separate Production/Preview namespaces and shared
Preview namespace across preview branches by default.

## Services and routing

Import the repository with the **repository root** as the Vercel project root.
`vercel.json` defines `client` (Vite, root `client`) and `server` (Fastify,
root `server`, explicit `src/index.ts` entrypoint). Keep access to files outside
each service root enabled: both use `shared/`, and the server bundles the five
sample CSVs via its service-scoped `functions.includeFiles` setting.

- `/api` and `/api/*` are public server routes; all other paths reach client.
- The `/api` prefix is preserved. Fastify already registers its routes with
  that prefix, and browser calls already use same-origin `/api/...` URLs.
- API 404s stay API 404s, not the client HTML fallback. The catch-all comes last.
- Framework, build and function settings belong to their services, not the root.

There are **no production service-to-service calls or bindings**. The client
is a static bundle: JavaScript in the user's browser calls the public API.
Vercel bindings resolve only in service functions, so adding a binding to a
static frontend would not make it available to browser code. Do not expose a
binding URL through a `VITE_*` variable or attempt to use one during a build.
The Vite `API_URL` proxy setting is for standalone local development only;
it is not a production binding. `vercel dev` routes `/api` to server itself.
If the API must be internal, a server-side frontend gateway is a separate
architecture change requiring confirmation before adding a client→server binding.

## Durable storage

The proposed provider is **private Vercel Blob**, consumed only by server.
Attach a private Blob store to the Vercel project and selected environments;
Vercel supplies `BLOB_READ_WRITE_TOKEN`. Keep this server-side and never add
its value to the repository or a browser build. Blob is a managed external
storage resource, not another named service or a service binding.

- With the token present, uploads/results and metadata are stored together as
  private JSON objects. No process-local metadata index is used in Blob mode.
- Origin reads (`useCache: false`) avoid stale metadata after writes. Metadata
  updates use ETag preconditions; conflicting updates return 409 for refresh/retry.
- Files are stored by File ID at `<namespace>/files/<id>.json`, so a file is
  read directly by its ID. A new base number is claimed by creating
  `<namespace>/claims/<base>.json` with "fail if it exists"; a server that loses
  the race takes the next number, so concurrent uploads never share an ID. A
  re-run result is written to its fixed ID (`101010-M`), last write wins.
- Objects saved before File IDs (under `<namespace>/records/`) are not read;
  that demo data is reset, not migrated.
- Sample creation is idempotent across cold starts (samples take IDs
  `100001`–`100005` and are created only if absent). Sample CSVs remain unchanged.
- Default namespace: `icorium/<VERCEL_ENV>`, or `icorium/development` locally.
  `RECLAIM_BLOB_PREFIX` overrides it. Production and Preview are separate by
  default, but preview branches share the preview namespace; use an environment
  override or separate stores if branch-level isolation is needed.
- Listings read each file object, including its CSV, and paginate through the
  store. This favors simplicity for the interview-sized dataset, not large-scale
  file catalogs. Storage API usage and transfer can incur provider charges.
- Vercel startup fails clearly when no token is configured. It never silently
  falls back to temporary cloud disk. Do not configure `RECLAIM_DATA_DIR` on a
  deployed project; it is an explicit local/test override.

Existing `server/data` files are **not automatically migrated**. Vercel starts
with the five bundled samples; upload other CSVs/results through the app. Local
development still uses `server/data` when no Blob token is provided. Current
API access remains unauthenticated and the deployed app shares one dataset;
use the fictional demo data, not private uploads, for this configuration.

## Local service testing

Run from the repository root:

```powershell
# Official CLI, local-only mode; no cloud login or deployment is required.
# This explicit data override avoids contacting a real Blob store.
$env:RECLAIM_DATA_DIR = Join-Path ([IO.Path]::GetTempPath()) 'icorium-vercel-local'
npx vercel dev -L --listen 5300
```

The current CLI calls `-L` deprecated and accepts `--local` as the equivalent.
Use `vercel dev` with project configuration when validating actual Blob access.
Do not manually set service binding URL variables. No binding variables are
needed by this static-client/public-API architecture.

Check `/` for HTML; `/api/files` for JSON; process a sample and download/compare
results. An unknown `/api/...` path must return an API 404, not HTML. Run
`npm run verify` and `npx tsc -p server/tsconfig.json --noEmit` before publication.

Vercel's function request/response size limits also apply. The app's local 10 MiB
upload limit does not override Vercel's 4.5 MB body limit; use small demo CSVs.
Larger-file support would need direct Blob uploads/downloads and is not part
of this change. Do not raise the local limit expecting to bypass the platform.

## Validation and outstanding checks

- Vercel CLI 65.12.1 detected both service names/frameworks from the config.
- `vercel dev -L` was attempted with isolated local data, but builder installation
  failed with Windows `EPERM` while creating a symlink in Vercel's builder cache.
  Full service routing/bundling was not exercised successfully on this machine.
- Tests use an in-memory mock of Blob's SDK calls: persistence across fresh API
  instances, metadata, paging, replacements, cold-start seeding and conflicts.
  They do not prove connectivity or permissions against a live Blob store.
- A real Vercel build, private store connection, and deployed routing/storage
  smoke test remain required after provisioning. Nothing has
  been published by this change.

The configuration choices above are confirmed. Provisioning the project/store
and publishing a deployment are separate actions that have not been performed.

References: [Services](https://vercel.com/docs/services),
[routing](https://vercel.com/docs/services/routing),
[bindings](https://vercel.com/docs/services/bindings),
[Fastify](https://vercel.com/docs/frameworks/backend/fastify),
[Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk),
[consistent private reads](https://vercel.com/changelog/vercel-blob-now-supports-consistent-reads-on-private-storage),
[function limits](https://vercel.com/docs/functions/limitations).
