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

## Verify

- **Automated:** `npm run verify` passes, including the new tests.
- **Independent review:** a fresh reviewer checks the credential handling and that only the intended PR can change.
- **On GitHub:** the next `/approve` creates the PR with the reviewed title and description, and reports its link and checks. The person only reviews and merges.
