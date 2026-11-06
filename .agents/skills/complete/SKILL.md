---
name: complete
description: Finish the current Icorium work item, verify it, and prepare commit and PR drafts for review. Use for /complete, $complete, or a request to prepare finished work for approval. Does not commit, push, or publish a PR.
---

# Complete

Read `AGENTS.md`, `CLAUDE.md` and `blueprint/commit-rules.md` from the repository
root. This skill prepares one work item for approval; it grants no publication
permission and must never invoke approve itself.

1. Inspect the branch, HEAD, staged/unstaged diff and untracked files. Stay on
   the current work branch. If on `main` or detached HEAD, create a descriptive
   work branch before editing. Identify the exact files belonging to this item;
   preserve unrelated files and staged changes. Review new files as well as diffs.
2. Run `npm run verify` (server tests and client type-check/build; no browser
   tests). Report manual UI checks separately; do not require or restore browser
   tests while the UI is being edited. If verification fails or cannot run, report the actual failure
   and stop without marking the work complete. Fix failures within the requested
   scope where feasible, then rerun. Never claim stale evidence is current.
3. Update only build-plan checkboxes actually satisfied by this work. Icorium
   has no required active-spec, findings or archive files; do not create or
   reset Vetiflow's context machinery. If tracked files change after verification,
   run verification again before preparing the final handover.
4. Write the following ignored files under `blueprint/context/`:
   - `landing-commit.txt`: the complete commit message, ready for `git commit -F`.
   - `landing-pr.md`: PR title on the first line, followed by the complete body.
   - `landing-review.md`: branch, HEAD, exact intended file list (including
     deletions), scope summary, actual verification command and result, and
     SHA-256 hashes of both drafts and every intended file's current contents.
     Record deletions explicitly. This binds review to the prepared work;
     hashes are integrity evidence, not test evidence.
   Follow `blueprint/commit-rules.md` for all wording and attribution. Do not
   fabricate missing session attribution. Note its absence if none was provided.
5. Read back the drafts and check their claims, sections, title and references.
   Check the title with `scripts/check-pr-title.ps1` using an available PowerShell.
   Present the full commit message and PR description, the intended file list,
   verification results and links to the drafts. Explain that `/approve`
   authorizes this commit, push and PR creation/update. Wait for the person.

End with the project's Status/Next lines. On success:

Status: Verified; commit and PR drafts prepared. Nothing committed.
Next: Review the drafts, then type /approve to commit, push and open the PR.
