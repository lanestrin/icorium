# Fix: PR titles reach main in Conventional Commit form

**Type:** Fix
**Status:** verified
**Branch:** `chore/pr-title-handoff-and-tests`

## The problem

PR #60 (feature 12.1) was squash-merged as
`Feature/12.1 automated releases (#60)`. release-please could not parse it
("unexpected token") and skipped the release, so 12.1 is missing from the
next version.

- **The draft was right.** `/complete` drafted
  `feat: add automated releases and a version label (12.1)`, and `/approve`
  checked it with `scripts/check-pr-title.ps1`.
- **The PR was opened by hand without that title.** `gh` isn't installed, so
  the person opens each PR on GitHub. GitHub filled in a title from the branch
  name because the branch had two commits, and it was kept.
- **The "PR title" check failed on PR #60, but the merge went ahead.** The
  check isn't required on `main`. `blueprint/commit-rules.md` only
  *recommends* making it required.
- **The squash commit takes the PR's title**, so a correct local commit
  subject doesn't fix this on its own.
- **The title script has no tests**, so its feat, fix and breaking-change
  rules aren't checked automatically.

## The fix

Close the gap at the hand-off, and make GitHub enforce the title. No new
dependency, workflow or release-please change.

- **Prefilled PR link (`.agents/skills/approve/SKILL.md`, which Claude's
  `/approve` reads):**
  - **When no GitHub connector or `gh` is available:** after the push, stop
    and output the PR title and the full description from `landing-pr.md`,
    ready to paste.
  - **The link:** a compare URL that opens the new PR with the title already
    filled in:
    `https://github.com/<owner>/<repo>/compare/main...<branch>?quick_pull=1&title=<URL-encoded title>`.
  - **No missing-tool report:** don't search for `gh` or report its absence
    as a blocker.

  This moves the person's standing preference, now only in Claude's local
  memory, into the shared skill, so Codex and other tools follow it too.
- **Title tests (`server/src/pr-title.test.ts`, new):**
  - **How it runs:** Vitest runs the real `scripts/check-pr-title.ps1` with
    `pwsh` when available (CI on Ubuntu has it), otherwise Windows
    PowerShell. It sits in `server/src` because that is where the existing
    Node test runner picks up tests; `scripts/` has none.
  - **Pass cases:** `feat:`, `fix:`, `feat!:`, `fix!:`, `chore:`, `docs:`
    and `test:` titles, including one ending with the item ID.
  - **Fail cases:** `Feature/12.1 automated releases`, an unknown type
    (`perf:`), a scope (`feat(ui):`), a missing space or summary, a 73-character
    title and a trailing full stop.
  - **Release config cross-check:** a test that `release-please-config.json`
    shows `feat` and `fix` and hides `chore`, `docs` and `test`, so every type
    the check accepts either releases or is deliberately hidden.
- **Docs (`blueprint/commit-rules.md`):**
  - Turn "Recommended GitHub settings" into required one-time settings:
    - a ruleset on `main` requiring the "verify" and "PR title" checks;
    - squash merge only;
    - squash "Default commit message" set to **Pull request title**.
  - Say why: the squash commit subject comes from the PR title, not from
    local commits.
  - In "Releases", add how to fix an already-merged non-conventional title:
    add a `BEGIN_COMMIT_OVERRIDE` ... `END_COMMIT_OVERRIDE` block to the
    merged PR's description, then run "Release" manually. Never rewrite
    `main` or move tags.
- **Must not break:**
  - the title check's current rules;
  - `.github/workflows/pr-title.yml`, `release.yml` and
    `release-please-config.json`, all unchanged;
  - the `v1.0.0` tag and the 12.1 archive, both untouched;
  - `/approve` with a GitHub connector or `gh`, unchanged.
- **Outside the repo (the person):**
  - the GitHub settings above;
  - the override block on PR #60;
  - a manual Release run.

## Build steps

- [x] **Step 1 - Title tests** - Add `server/src/pr-title.test.ts` as above.
  *Done when:* the pass and fail cases and the config cross-check pass in
  `npm test -w server`.
- [x] **Step 2 - Hand-off and docs** - Update the PR-tooling bullet in
  `.agents/skills/approve/SKILL.md`, and the GitHub settings and override
  guidance in `blueprint/commit-rules.md`. *Done when:* both read as
  described, and the compare-URL format is shown with the title encoded.

## Verify

- **Automated:** `npm run verify` passes, including the new title tests.
- **On GitHub (after merge, done by the person):**
  - With the ruleset on, a PR titled like `Feature/x` shows "PR title"
    failing and can't be merged.
  - The next `/approve` link opens a PR with the drafted title already filled
    in.
  - After the override on PR #60 and a manual Release run, release-please
    opens `chore: release 1.1.0` listing 12.1 under Features.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4836,"specSha256":"8b685259fb45b241380284b8a47aad45a7a09c1a4dfede8f788c0e4882789627","branch":"refs/heads/chore/pr-title-handoff-and-tests","head":"48fc3cb0b6d3e4627977a778b23c2c252b26449f","baseRef":"refs/heads/main","baseCommit":"48fc3cb0b6d3e4627977a778b23c2c252b26449f","sourceTree":"3a056f7b29a06ee137136ac57d2b17bdc290a81d","landing":"pull-request","absentOptional":[]} -->
