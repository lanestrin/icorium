# Deploying Reclaim Studio {{TAG}}

This folder is the release {{TAG}} (version {{VERSION}}), built from commit
`{{COMMIT}}`. `RELEASE-MANIFEST.json` lists every application file with its
SHA-256. Nothing in this folder is a secret.

Reclaim Studio is a static web app: it runs entirely in each visitor's
browser and keeps their files in that browser's storage (IndexedDB). There is
no server or database to run.

## Requirements

- Node.js 24 and npm, to build it.
- Any host that serves static files.

## Build

```bash
npm ci                      # installs exactly the versions in package-lock.json
npm run build -w client     # the static site in client/dist
```

Serve `client/dist` as the site root. Its `generator/index.html` and
`architecture/index.html` serve `/generator` and `/architecture`. On Vercel,
`vercel.json` already builds and serves it.

## Build-time setting

| Variable | Purpose | Default |
| --- | --- | --- |
| `APP_ENV_LABEL` | Label after the version in the page navigation | none |

Each visitor's uploads and results stay in their own browser and are lost when
they clear its data. The five sample files are built into the site.

## Check the download

```bash
sha256sum -c icorium-v{{VERSION}}.zip.sha256
```
