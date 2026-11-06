# Icorium agent instructions

Read `CLAUDE.md` for project layout, implementation rules and verification.
Follow `blueprint/commit-rules.md` for the complete Git workflow.

For planned work, use the stable feature IDs and build order in
`blueprint/build-plan.md`. When asked what to build next, choose the first
unchecked feature with satisfied dependencies and report its ID, title,
branch, reason and starting action. Update the plan's next-feature
recommendation after a feature is completed; never infer completion from
an existing file or a passing build alone.

For `/complete` or `$complete`, read `.agents/skills/complete/SKILL.md`.
For `/approve` or `$approve`, read `.agents/skills/approve/SKILL.md`.
Only the person's explicit approval authorizes publication; never invoke
approve automatically. `/approve` after reviewing completion drafts authorizes
one commit, push and PR creation/update, as documented in the commit rules.

For each new work item, create a descriptive branch before editing. Continue
on an existing branch only for the same work item. Preserve unrelated changes.
After implementing and verifying, present the full commit message, PR title
and PR description for review. Wait for the person's explicit approval before
committing. Approval applies only to the prepared commit. Push and publish a
PR only when explicitly authorized. Never commit directly to `main`, merge
or force-push.
