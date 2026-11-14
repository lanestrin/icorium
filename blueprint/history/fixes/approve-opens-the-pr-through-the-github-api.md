# Fix: /approve opens the PR through the GitHub API

**Type:** Fix
**Status:** verified
**Branch:** `chore/approve-opens-pr-through-github-api`

## The problem

When no GitHub connector or `gh` is available, `/approve` hands over a link made by `scripts/pr-link.mjs` (from PR #65) that should open the PR with the reviewed title and description filled in.

- **GitHub ignored the link's description.** When the person opened it for PRs #64 and #65, the description box showed the commit body plus the PR template comment instead.
- **Both PRs were fixed through the API.** Their descriptions were replaced with the reviewed drafts and read back to check.
- **The person chose this as the standing rule (2026-11-14):** `/approve` creates or updates the PR through GitHub's API, using the credential Git already uses to push, so nothing has to be pasted or clicked before the merge.
- **The link script is now unused machinery** on `main`.

## The fix

**Replace the link script with one that opens the PR through the API.** Node standard library only (`fetch`, `child_process`); no new dependency.

**`scripts/open-pr.mjs`** (replaces `scripts/pr-link.mjs`, keeping its `githubRepo` and `splitDraft`):

- **Pure helpers, kept from `pr-link.mjs`:**
  - `githubRepo(remoteUrl)` returns owner/repo from an HTTPS or SSH GitHub remote.
  - `splitDraft(draft)` returns the title (first line) and description (the rest). It refuses an empty title or description, or the commit-override marker words.
- **`openPr({ request, repo, branch, headSha, title, body })`:**
  - `request(method, path, body)` makes one GitHub API call. Tests pass in a fake.
  - **Checks first:** refuses `main`, and refuses if the remote branch head isn't exactly `headSha`, the reviewed, pushed commit.
  - **Finds or creates:** looks up open PRs for `owner:branch` into `main`. With exactly one, it updates that PR's title and description. With none, it creates one. With more than one, it stops.
  - **Never touches** a closed or merged PR, or any other PR.
  - **Reads back** the PR and requires the title and description to match the draft exactly.
  - **Returns** the PR number, URL, whether it was created or updated, and each check-run's name and status.
- **Credential handling (command line only):**
  - The token comes from `git credential fill` for `https://github.com`, with prompts turned off (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`).
  - It's held only in memory and sent only in the `Authorization` header to `api.github.com`. It's never printed, logged, put in a URL or written to a file.
  - Error messages contain the HTTP method, path, status and GitHub's message, never the request headers.
  - With no stored credential, it stops and says so.
- **Running it:** `node scripts/open-pr.mjs` reads `blueprint/context/landing-pr.md`, the current branch, `HEAD` and `origin`. It prints the PR link, whether it was created or updated, and the check status. It exits 1 with a reason on any refusal.

**`server/src/open-pr.test.ts`** (replaces `server/src/pr-link.test.ts`), using a fake `request` with no network:

- the remote and draft cases kept from `pr-link.test.ts`;
- creates a PR when none is open;
- updates the single open PR without creating another;
- stops with more than one open PR;
- stops when the remote head isn't the reviewed commit;
- stops on `main`;
- fails when the read-back title or description differs;
- never calls the API for a refused draft.

**Credential-handling test:** a fake error carrying an `Authorization` header must not include the token in the message the script prints.

**`.agents/skills/approve/SKILL.md`:** replace the link bullet.
- **With no connector or `gh`:** run `node scripts/open-pr.mjs` after the push, then report the PR link, created or updated, and the check status it prints.
- **If it refuses or fails:** stop, report its message, and say whether the commit and push succeeded.
- **Do not:** build API calls by hand, print the credential, or search for or suggest installing `gh`.

**Must not break:** `/approve` with a connector or `gh`, the title check, `landing-pr.md`'s format, and the PR template.

**Not changing:** application code, the workflows, the release configuration and tags.

**Gate:** this handles a credential and writes to GitHub, so `qualityGates.regular.independentReview: when-sensitive` applies. It needs an approved review checkpoint and a fresh independent reviewer before `/complete`, as 12.1 had.

## Build steps

- [x] **Step 1 - API script and tests**
  - Add `scripts/open-pr.mjs` and `server/src/open-pr.test.ts`.
  - Remove `scripts/pr-link.mjs` and `server/src/pr-link.test.ts`.
  - *Done when:* the tests pass in `npm test -w server`, and no file outside `blueprint/history/` mentions `pr-link`.
- [x] **Step 2 - Hand-off**
  - Replace the link bullet in `.agents/skills/approve/SKILL.md` as above.
  - *Done when:* the bullet runs the script, reports its output, and covers refusals, without printing the credential or making hand-built API calls.
- [x] **Step 3 - Repair F-02 (scrub before truncating)**
  - In `githubRequest`, remove the token from GitHub's error text before cutting it to 400 characters, so a token that GitHub echoes across the cut can't leave a partial token behind.
  - Add a test whose echoed token crosses the 400-character boundary.
  - *Done when:* the new test passes, and F-02 is marked `fixed` for the next independent review to close.

## Verify

- **Automated:** `npm run verify` passes, including the new tests.
- **Independent review:** a fresh reviewer checks the credential handling and that only the intended PR can change.
- **On GitHub:** the next `/approve` creates the PR with the reviewed title and description, and reports its link and checks. The person only reviews and merges.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":5808,"specSha256":"0e2759be77f6bc9f7605a5fbabf9f98167c22abceeda85c497ae24da1f96dee3","branch":"refs/heads/chore/approve-opens-pr-through-github-api","head":"a0a7e04c6013aa2b1c024cfe4d2052f153b08bd0","baseRef":"refs/heads/main","baseCommit":"81f55078786add91f7f1be69c19077b1ff5c3b07","sourceTree":"ce60805b86586a946b964f9c059dced24ee7b1aa","landing":"pull-request","absentOptional":[]} -->

## Findings

### approve-opens-the-pr-through-the-github-api/F-02 [P3] closed - GitHub error text is truncated before the token is scrubbed

**File:** scripts/open-pr.mjs:79
**Found:** 2026-11-14 by /audit (scope: current; lens: security)
**Why it matters:** `githubRequest` builds the failure message, cuts it to 400 characters with `.slice(0, 400)`, and only then calls `scrub`. If GitHub's error text ever echoed the token so that it straddled the 400th character, the cut would leave a partial token prefix that no longer matches the full token, so it would be printed unredacted. GitHub does not normally echo credentials, so this is unlikely, but the spec promises the token never reaches an error message.
**Suggested fix:** Scrub first, then truncate: `scrub(..., token).slice(0, 400)`, and add a test whose echoed token crosses the 400-character boundary. No current requirement is lost.
**Resolution:** fixed 2026-11-14 by /implement (spec Step 3): `githubRequest` now scrubs the token before cutting the message to 400 characters (`scripts/open-pr.mjs`); new test `keeps every part of the token out of an error message cut at 400 characters` fails on the old order and passes on the new. Awaiting /audit re-review.
closed 2026-11-14 by independent /audit (scope: current; lenses: quality, security, performance, tests) at a0a7e04: `scripts/open-pr.mjs:80` now calls `scrub(...)` on the full message and only then `.slice(0, 400)`, so every full copy of the token is replaced before the cut and no partial prefix can survive; the network-error path (line 69) scrubs without truncating. Test `server/src/open-pr.test.ts:146-155` places the echoed token across the 400th character and asserts the length cap and that no 5-character token prefix remains; `npm run verify` passed. The repair introduced no new defect.

## Independent review

**Status:** passed
**Target commit:** a0a7e04c6013aa2b1c024cfe4d2052f153b08bd0
**Base commit:** 81f55078786add91f7f1be69c19077b1ff5c3b07
**Base ref:** origin/main
**Spec hash:** 0e2759be77f6bc9f7605a5fbabf9f98167c22abceeda85c497ae24da1f96dee3
**Prepared by:** claude
**Builder model:** claude-opus-5-5
**Requested reviewer:** claude
**Requested model:** claude-opus-5-5
**Requested execution:** automatic
**Requested at:** 2026-11-14T17:14:32-06:00
**Workflow:** regular
**Check required:** no
**Reviewer adapter:** claude
**Reviewer model:** claude-opus-5-5
**Reviewer context:** fresh subagent
**Actual execution:** automatic
**Reviewed at:** 2026-11-14T17:18:00-06:00
**Scope:** current
**Lenses:** quality, security, performance, tests
**Verdict:** passed
**Check result:** not-required

### Handoff

Review the active spec and the complete `81f55078786add91f7f1be69c19077b1ff5c3b07..a0a7e04c6013aa2b1c024cfe4d2052f153b08bd0` delta in a fresh
session or isolated subagent without the builder conversation. Run all Audit lenses from scratch.
Run Check when required above. Do not edit product code, accept findings, or
reuse the existing findings as the review scope.

### Commands

- `git rev-parse HEAD`: pass (equals Target commit)
- `git merge-base origin/main HEAD`: pass (equals Base commit)
- `sha256sum blueprint/context/current-feature.md`: pass (equals Spec hash; spec is tracked, no snapshot field)
- `git status --porcelain --untracked-files=all`: pass (only `blueprint/context/review.md` and `blueprint/context/findings.md` differ)
- `git diff --stat <base>..<target>` and `git grep pr-link` outside `blueprint/history/`: pass (only the spec mentions it)
- `npm run verify`: pass (server 5 files / 268 tests, client 11 files / 154 tests, `tsc --noEmit` and `vite build` succeeded)

### Evidence

- Delta reviewed in full: `scripts/open-pr.mjs` (new), `server/src/open-pr.test.ts` (new), `scripts/pr-link.mjs` and `server/src/pr-link.test.ts` (removed), `.agents/skills/approve/SKILL.md`, `blueprint/context/current-feature.md`; `.claude/skills/approve/SKILL.md` is an unchanged wrapper that delegates to the `.agents` file.
- Token handling: read via `git credential fill` with `GIT_TERMINAL_PROMPT=0`/`GCM_INTERACTIVE=never` and stderr ignored; a failed fill's output is discarded (`scripts/open-pr.mjs:138-153`). The token is used only in the `Authorization` header to `https://api.github.com` (line 58-61); URLs carry only repo, branch, PR number and SHA; nothing is written to disk; error text is scrubbed before truncation (lines 69, 80) and never includes headers.
- PR targeting: refuses `main` and a non-40-hex SHA before any call; requires the remote branch head to equal `HEAD`; lists only `state=open&base=main&head=<owner>:<branch>` and re-filters on `head.ref`/`base.ref`; more than one stops; PATCH only the single match, else POST with `base: 'main'`; read-back requires exact title and trimmed body (lines 91-135). A closed or merged PR can never be patched.
- `runFromCommandLine` calls `splitDraft` before reading the credential or calling GitHub, so a refused draft makes no API call.
- Tests cover create, update-one, closed-PR untouched, multiple-open stop, remote-head mismatch, main and short SHA with zero calls, read-back mismatch, draft and remote parsing, token-only-in-header, scrubbed 401 echo, token across the 400-character cut, scrubbed network error.
- Approve skill wording runs the script after the push, reports its output, stops on refusal stating commit/push state, and forbids hand-built API calls, printing the credential and searching for `gh`.
- No performance concern: a fixed handful of sequential API calls per run.

### Findings

- F-01 [P3] open - unrelated earlier work, kept verbatim.
- F-02 [P3] closed - scrub-before-truncate repair confirmed correct and tested.
- F-03 [P3] open - a credential embedded in the origin URL would be echoed by `githubRepo`'s refusal message (`scripts/open-pr.mjs:23`); not reachable in this checkout.

### Remaining risk

- Real GitHub API behaviour (branch lookup, PR list filtering, PATCH/POST, body normalisation on read-back, check-runs permissions) is not exercised locally; all tests use a fake `request` or `fetch`.
- If the check-runs read fails after the PR was created or updated, the script exits 1 without saying the PR exists; a retry safely updates the single open PR.
- `git credential fill` and the command-line entry point are not run by tests; they were not executed by this reviewer by instruction.
- Check was not required and was not run; browser visuals are out of scope for this change.
