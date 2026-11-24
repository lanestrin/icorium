# Deploying Reclaim Studio {{TAG}}

This folder is the release {{TAG}} (version {{VERSION}}), built from commit
`{{COMMIT}}`. `RELEASE-MANIFEST.json` lists every application file with its
SHA-256. Nothing in this folder is a secret.

Reclaim Studio is a static web app: it processes files in each visitor's
browser, and there is no server of ours to run. Access needs sign-in: the file
workspace opens for an active invited account (its files are kept in a private
Supabase workspace) or for a guest demo (its files stay in that browser tab and
are discarded when the demo ends). The Admin, Architecture and Generator pages
open only for an active Admin or an Admin demo (fictional data, simulated actions,
nothing sent to Supabase). Without Supabase settings, only the two demos open the
workspace, and a standard demo is denied those three pages.

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
| `VITE_SUPABASE_URL` | The Supabase project URL, a public value; with the key below it turns on sign-in | none |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The Supabase publishable key, a public value; never the secret key | none |

Accounts, invitations and the database rules need a Supabase project set up as
described in `supabase/README.md`; that setup is not part of this folder. A
demo guest's uploads and results stay in their own browser tab and are lost
when the demo ends or they clear its data. The five sample files are built
into the site.

## Check the download

```bash
sha256sum -c icorium-v{{VERSION}}.zip.sha256
```
