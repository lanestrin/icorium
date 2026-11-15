# Deploying Reclaim Studio {{TAG}}

This folder is the release {{TAG}} (version {{VERSION}}), built from commit
`{{COMMIT}}`. `RELEASE-MANIFEST.json` lists every file with its SHA-256.
Nothing in this folder is a secret; put secrets in your host's environment.

## Requirements

- Node.js 24 and npm.
- A host that serves static files and runs one Node.js process, with `/api/*`
  routed to that process on the same origin as the web pages.

## Build and run

```bash
npm ci                      # installs exactly the versions in package-lock.json
npm run build -w client     # static web app in client/dist
npm start -w server         # API on PORT (default 3001) and HOST (default 0.0.0.0)
```

Serve `client/dist` as the site root. Its `generator/index.html` and
`architecture/index.html` serve `/generator` and `/architecture`. Send every
`/api/*` request to the API. On Vercel, `vercel.json` already does this.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT`, `HOST` | Where the API listens | `3001`, `0.0.0.0` |
| `MAX_UPLOAD_MB` | Largest accepted upload | `10` |
| `LOG_LEVEL` | API log level | `warn` |
| `RECLAIM_DATA_DIR` | Store files in this local folder | `server/data` |
| `BLOB_READ_WRITE_TOKEN` | Store files in a private Vercel Blob store instead (secret) | unset |
| `RECLAIM_BLOB_PREFIX` | Folder inside the Blob store | `icorium/<environment>` |
| `APP_ENV_LABEL` | Label after the version in the page navigation, set at build time | none |

Local storage keeps files only as long as the host's disk does. On the first
start the API adds the five sample files from `sample-data/`.

## Check the download

```bash
sha256sum -c icorium-v{{VERSION}}.zip.sha256
```
