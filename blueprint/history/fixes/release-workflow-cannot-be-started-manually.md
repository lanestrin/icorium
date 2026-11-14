# Fix: Release workflow cannot be started manually

**Type:** Fix
**Status:** verified
**Branch:** `chore/release-workflow-manual-trigger`

## The problem

`.github/workflows/release.yml` (added in 12.1) runs only on `push` to
`main`. The first run, from merging PR #60, hit a startup failure:
`googleapis/release-please-action@v4` was not yet allowed by the
repository's Actions settings. The person has since allowed that action and
set the `RELEASE_PLEASE_TOKEN` secret (2026-11-14).

- GitHub offers no re-run for a startup failure.
- With only a `push` trigger, the workflow can't be retried without merging
  something else to `main`.

## The fix

Add a `workflow_dispatch:` trigger under `on:` in
`.github/workflows/release.yml`, next to the existing `push` trigger on
`main`. A manual run then goes through the same job as a push: release-please
compares `main` with the last release and opens or refreshes the release PR.

- **Keep:** the `push` trigger on `main` (future releases stay automatic), the
  job, the action and its `@v4` pin, the token, the `contents: write` and
  `pull-requests: write` permissions, and the `release` concurrency group.
- **No inputs:** release-please needs none, so the manual trigger takes no
  parameters.
- **Docs:** one line in the "Releases" section of `blueprint/commit-rules.md`
  saying the workflow can also be started from the Actions tab to retry a
  failed run.
- **Not changing:** application code, tests, tags, releases, CI or the
  PR-title workflow.
- **Branch and title:** a `chore/` branch, at the person's request, so the PR
  title is `chore:`. That adds no changelog entry and no version bump.

## Build steps

- [x] **Step 1 - Manual trigger** - Add `workflow_dispatch:` to `on:` in
  `.github/workflows/release.yml`, and update its header comment to mention
  manual runs. Add the retry line to "Releases" in
  `blueprint/commit-rules.md`. *Done when:* the workflow file parses as YAML
  with both `push` (branches `[main]`) and `workflow_dispatch` under `on:`,
  the rest of the file is unchanged, and `npm run verify` passes.

## Verify

- **Automated:** `npm run verify` passes. It doesn't cover workflow files, so
  this only shows nothing else broke. A YAML parse check confirms the triggers.
- **On GitHub (after merge):**
  - The merge itself is a push to `main`, so the Release workflow should run
    on its own.
  - The Actions tab should also show a **Run workflow** button for
    "Release".
  - A successful run opens `chore: release 1.1.0`, whose changelog starts
    after `v1.0.0`. This also depends on the v1.0.0 GitHub Release being
    published and on the override block in PR #60's description, so that the
    12.1 merge counts as a `feat:`.
  - Only a real run can prove this.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":2764,"specSha256":"cd8c1261d3bed5838da5a655720163713211b76119f7534e724f322a1bc24f1b","branch":"refs/heads/chore/release-workflow-manual-trigger","head":"d3e4245ac72ebc8b91996cd483191f9395b0e6e7","baseRef":"refs/heads/main","baseCommit":"d3e4245ac72ebc8b91996cd483191f9395b0e6e7","sourceTree":"c44fae7e03615beb4a19590d711804fc0c381b1b","landing":"pull-request","absentOptional":[]} -->
