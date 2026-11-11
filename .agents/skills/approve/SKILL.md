---
name: approve
description: Publish the reviewed Icorium work prepared by complete after explicit user approval. Use for /approve or $approve. Commits, pushes and creates or updates the PR for that one reviewed work item.
---

# Approve

Read `AGENTS.md`, `CLAUDE.md` and `blueprint/commit-rules.md` from the repository
root. Skill discovery or automatic selection is not authorization. Proceed with
mutations only when the person explicitly invoked `/approve` or `$approve`
after the completion drafts were presented, or explicitly authorized the same
commit, push and PR actions. Never call this skill on behalf of the person.
Approval applies to this reviewed work item only. Never merge, force-push,
amend, bypass hooks or commit directly to `main`.

## Check before publishing

For a retry after a commit or push already succeeded, establish the existing
commit first under the retry rule below. The original reviewed HEAD is then its
sole parent, not the new HEAD. Require the exact intended commit tree and drafts,
with no later content changes; do not return to Complete merely because the
authorized commit now exists. The tested file manifest must still match.

1. Read `blueprint/context/landing-review.md`, `landing-commit.txt` and
   `landing-pr.md`. They must come from completion of this branch. Compare
   branch, HEAD, exact intended paths, current file hashes, deletion state and
   draft hashes with the review record. Inspect all staged, unstaged and
   untracked changes. If the reviewed content, branch or HEAD changed, or the
   record is absent, stop and use complete to prepare fresh drafts for a new
   approval. Do not silently repair the drafts and treat them as approved.
2. Require successful `npm run verify` evidence recorded by Complete (server
   unit/API tests, client unit/component tests and client type-check/build).
   Compare the complete tested-candidate manifest, including unchanged tracked
   files, modes, deletions and intended untracked additions. Inspect remaining
   untracked inputs and runtime/dependency/environment changes. Reuse the pass
   only when the exact candidate and relevant inputs are provably unchanged.
   Missing evidence, uncertainty or a previous failure requires rerunning Verify
   before committing. A tracked change, including archival edits, invalidates
   reuse. Changed reviewed content still returns to Complete for new drafts and
   fresh approval under step 1; a rerun never approves changed content. On
   failure, stop without committing or pushing. Repairs require new drafts and
   fresh approval. Never treat automated evidence as manual or visual UI checks.
3. Validate the subject with `scripts/check-pr-title.ps1`. Confirm the commit
   and PR drafts follow the commit rules and reflect the actual verification.
   A message override requires presenting the revised draft before approval.
4. Show the intended file list and subject. Stage only those explicit paths
   (`git add -- <paths>`), never `git add -A` or `git add .`. Before staging,
   stop if unrelated paths are already staged; do not unstage them automatically.
   Inspect the staged diff and ensure it exactly matches the reviewed changes,
   including complete file contents. Stop on any discrepancy. Never stage
   `landing-*`, secrets, build output or unrelated work.

## Commit, push and PR

- Commit with `git commit -F blueprint/context/landing-commit.txt`. If a hook
  fails, report it and stop. Do not bypass hooks or silently change the content.
- Push this branch to its configured remote, setting its upstream on first
  push. If the remote is ambiguous, resolve that before publication. On a
  rejection or authentication/network error, stop and report whether the
  commit exists locally. Do not rebase, merge, reset or force-push as a retry.
- Use an authenticated GitHub connector when available, otherwise `gh`.
  Find an existing PR for this exact repository, branch and `main` base first.
  Create or update that PR with the title from the first draft line and body
  from the rest. With `gh`, use a temporary body file and `--body-file`.
  Do not append the template or overwrite unrelated PRs. Read back the title
  and body when possible and report the actual PR URL.
- If PR tooling is unavailable, keep the completed drafts and report the
  exact access or tooling issue. Do not claim a PR was created or require the
  person to write its description.
- For a retry after a partial success, inspect the existing commit, remote
  branch and PR first. Confirm the existing commit matches the reviewed work;
  resume only the remaining authorized actions. Never create an empty or
  duplicate commit or PR. If the content changed, return to complete for review.

Report the commit hash, push result, PR URL and actual CI state. Do not claim
CI passed without checking it. End with the project's Status/Next lines naming
only what happened; after a successful PR, the next action is to review CI and
squash-merge when checks pass.
