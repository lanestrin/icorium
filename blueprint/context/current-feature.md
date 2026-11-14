# Feature: Automated releases

**From build-plan:** feature 12.1
**Build attempt:** 1
**Status:** verified
**Branch:** `feature/12.1-automated-releases`

## Goal

Version numbers, the changelog and GitHub Releases are worked out
automatically from the squash-merged PR titles, so the person never types a
version. Every page shows which version is running, and whether it is the
Test or Preview build. Today's `main` is the baseline **v1.0.0** (the person's
decision on 2026-11-13). This item sets up release-please only. 12.2 makes
Production follow releases and makes `main` the Test site.

## In scope

- **Root version:** root `package.json` gets `"version": "1.0.0"`, kept in
  sync in `package-lock.json`.
- **`release-please-config.json`:**
  - one package `"."`, `release-type: node`;
  - `pull-request-title-pattern: "chore: release ${version}"`, so release PRs
    pass `scripts/check-pr-title.ps1`;
  - changelog sections: `feat` → Features and `fix` → Bug Fixes, with
    `chore`, `docs` and `test` hidden.
- **`.release-please-manifest.json`:** `{ ".": "1.0.0" }`.
- **`.github/workflows/release.yml`:**
  - runs on push to `main` and calls `googleapis/release-please-action@v4`;
  - authenticates with `token: ${{ secrets.RELEASE_PLEASE_TOKEN }}`;
  - permissions: `contents: write`, `pull-requests: write`.
- **Version label:** shown in the "Pages" nav of all three pages.
  - **Format:** `v1.0.0`, or `v1.0.0 · Test`, or `v1.0.0 · Preview`.
  - **Test:** a Vercel Preview build of branch `main`.
  - **Preview:** a Vercel Preview build of any other branch.
  - **No suffix:** production builds and local builds.
- **Docs:**
  - a "Releases" section in `blueprint/commit-rules.md`;
  - `release.yml` named in the CI section of `AGENTS.md`;
  - the README Deploy section.

## Out of scope

- The `production` branch, the promote and rollback workflow, the Test
  storage prefix, Vercel settings and Architecture page text. These are all
  12.2.
- Creating the token or secret, pushing tags, or publishing releases. Those
  are the person's own external actions, listed in the Notes.
- Versions in `client/package.json` and `server/package.json`. One app
  version lives in the root file.

## Build loop

`workflow.stepReview` is `feature`: build every step, then produce one review
packet. Checkpoint commits are disabled. `/complete` writes the drafts, and
`/approve` (run by the person) commits and pushes.

## Build steps

- [x] **Step 1 - Release configuration** - Add `"version": "1.0.0"` to the
  root `package.json` and sync the lockfile's root entry with
  `npm install --package-lock-only`, adding no dependency. Add
  `release-please-config.json`, `.release-please-manifest.json` and
  `.github/workflows/release.yml` as above. *Done when:* `npm ci` and
  `npm run verify` still pass, and the JSON files parse. The workflow is only
  proven by its first real run on GitHub; the PR will say so.
- [x] **Step 2 - Version label** - Add `client/src/lib/app-version.ts` with
  two pure functions:
  - `environmentLabel({ vercelEnv, branch })`: `'Test'` for
    `vercelEnv === 'preview'` on branch `main`, `'Preview'` for other preview
    branches, and `''` otherwise;
  - `versionLabel(version, environment)`: `'v1.0.0'`, or
    `'v1.0.0 · Test'`, or `''` when there is no version.

  In `client/vite.config.ts`:
  - read the root `package.json` version;
  - read Vercel's build-time `VERCEL_ENV` and `VERCEL_GIT_COMMIT_REF`;
  - expose both labels through `define` as `import.meta.env.VITE_APP_VERSION`
    and `import.meta.env.VITE_APP_ENV`, typed in `client/src/vite-env.d.ts`.

  Add `client/src/components/AppVersion.tsx` next to `Banner.tsx`:
  - it renders the label as small grey text with `aria-label="App version"`;
  - it renders nothing when the label is empty;
  - it goes at the end of the "Pages" nav in `FilesPage`, `GeneratorPage`
    and `ArchitecturePage`.

  The label must not cause sideways scroll at phone width, since the navs
  already wrap.

  *Done when:*
  - `client/src/lib/app-version.test.ts` covers production, local,
    `main` preview, other-branch preview and a missing version;
  - a component test with `vi.stubEnv` shows `v1.0.0 · Test` on each page
    and nothing when no version is set;
  - `npm run build -w client` still succeeds.
- [x] **Step 3 - Docs** - Add a "Releases" section to
  `blueprint/commit-rules.md`, covering:
  - which titles bump what: `fix:` patch, `feat:` minor, `feat!:` or
    `BREAKING CHANGE:` major, and `chore`/`docs`/`test` none;
  - the single release PR, `chore: release x.y.z`, which only the person
    merges;
  - that merging it creates the tag, the GitHub Release and
    `CHANGELOG.md`;
  - that agents never push tags or publish releases without explicit
    authorization.

  Name `.github/workflows/release.yml` in `AGENTS.md`'s CI bullet. Add a
  short Releases paragraph to the README Deploy section.

  *Done when:* `npm run verify` passes.

## Files / areas

- **New:** `release-please-config.json`, `.release-please-manifest.json`,
  `.github/workflows/release.yml`.
- **Version:** `package.json` and `package-lock.json` (root version only).
- **Client:** `client/vite.config.ts`, `client/src/vite-env.d.ts`,
  `client/src/lib/app-version.ts` and its test,
  `client/src/components/AppVersion.tsx`, and the three pages with their
  tests.
- **Docs:** `blueprint/commit-rules.md`, `AGENTS.md`, `README.md`.
- **Plan:** `blueprint/build-plan.md` and `blueprint/stack.md`. Their earlier
  approved plan edits are already uncommitted on `main` and ship with this
  item.

## Data / contracts

- **Version source of truth:** the root `package.json` `version` and
  `.release-please-manifest.json`. release-please updates both, plus
  `CHANGELOG.md`, through its release PR.
- **Tags:** `vX.Y.Z` with no component prefix.
- **Release PR title:** `chore: release X.Y.Z`. It must keep passing the
  existing title check.
- **Secret:** `RELEASE_PLEASE_TOKEN`, used only by `release.yml`. Its value
  never appears in the repo or in logs.
- **Build-time values:** `VITE_APP_VERSION` and `VITE_APP_ENV` are public
  labels with no secrets. Locally there is a version but no environment
  suffix.

## Testing

- **Unit:** `app-version.test.ts`, covering the label rules.
- **Component:** the label on all three pages, and its absence when no
  version is set.
- **Final check:** `npm run verify`. Baseline on 2026-11-13 before any change:
  server 235/235, client 145/145, build OK.
- **Not runnable here:** GitHub Actions and release-please behavior. That is
  stated plainly in the PR, and checked by the first real run.

## Notes for the AI

- **PR type:** this PR's title will be `feat:`, as the branch prefix requires.
  Once merged, release-please will open "chore: release 1.1.0". That is
  expected, and the person can leave it open until 12.2 is ready.
- **Before merging this PR**, the person needs to do two things outside the
  repo (put them in the PR's Deploy notes):
  1. Create a fine-grained GitHub token for this repo with Contents and Pull
     requests read/write, and save it as the repository secret
     `RELEASE_PLEASE_TOKEN`. Without it, `release.yml` fails, and CI wouldn't
     run on release PRs opened with the default `GITHUB_TOKEN`.
  2. Tag current `main` (`296228e` at spec time, or whatever `main` is when
     they tag) as `v1.0.0` and publish it as a GitHub Release. release-please
     then starts counting from there. If the tag is missing, it would treat
     the whole history as unreleased.
- **Never** create the secret, push the tag or publish a release from an
  agent without explicit authorization in the current chat.
- **Proportional:** no `client` or `server` versions, no extra release
  tooling, and no version endpoint on the server.
