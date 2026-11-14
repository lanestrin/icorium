# Commit messages and PRs

Adapted from Vetiflow's `blueprint/context/coding-standards.md` for Icorium.
This is the single source for commit and PR conventions in this project.

## Approval and branches

Commit and push only when the person asks. Otherwise leave changes uncommitted.
Use one work item per branch and per commit. Never commit directly to `main`,
merge or force-push.

Use `/complete` to verify the work and present the commit and PR drafts.
Then wait for the person to type `/approve`: this explicitly authorizes that
one reviewed commit, push and PR creation/update. A request to add or edit
these skills is not an invocation. Approval to commit alone still does not
authorize pushing or publishing a PR.

Skills live in `.agents/skills/complete/` and `.agents/skills/approve/` for
Codex (`$complete` and `$approve`), with `.claude/skills/` entrypoints for
Claude Code (`/complete` and `/approve`). If a client reserves slash commands,
use the Codex skill picker or `$complete` / `$approve` instead. Reload the
project/session if newly added skills are not yet listed.

For every new work item, follow this sequence:

1. Inspect the branch and working tree. Before editing, create a descriptive
   branch with `git switch -c <type>/<short-name>`. Reuse the current branch
   only when continuing the same work item. Preserve existing changes; never
   reset, discard or include unrelated work in the commit.
2. Implement the requested changes and run the relevant verification.
3. Draft the full commit message, PR title and PR description using the rules
   below. Present the drafts and verification results to the person for review.
4. Stop before committing. Wait for the person's explicit approval of the
   prepared changes and message. A request to implement work is not approval
   to commit it. Approval covers only that prepared commit, not future commits.
   Material changes after approval require an updated draft and fresh approval.
5. Commit only after that approval. Push and publish the PR only when those
   actions are also explicitly authorized; approval to commit alone does not
   authorize either. Never bypass failed checks silently.

Choose the conventional type from the branch prefix:

| Branch | Type |
| --- | --- |
| `feature/` | `feat` |
| `fix/` | `fix` |
| `chore/` | `chore` |
| `docs/` | `docs` |
| `test/` | `test` |

## Commit message

- Subject: `<type>: <summary>`, imperative ("add", not "added"), at most
  72 characters, with no trailing full stop. For a build-plan item, end with
  its existing phase or item identifier; do not invent an ID.
- A change that breaks an API contract or requires a deploy step adds `!`
  after the type (`feat!: ...`) and a `BREAKING CHANGE: <what to do>` footer.
- Blank line, then a short paragraph explaining why the change was needed.
- Then 3 to 6 bullets describing what changed.
- Trailers last, one per line: `Refs: build-plan <phase or item>` when applicable,
  or `Refs: <existing project document>` for other documented work;
  `BREAKING CHANGE: ...` when applicable. No AI attribution: no AI
  `Co-Authored-By` trailer or generated-by line in commits or PRs; keep
  genuine human attribution. Do not invent an identity or a reference to a
  nonexistent history file.

AI writes the full commit message, PR title and description from the actual
diff, relevant project documents and verification evidence. The person reviews
and approves publication; do not ask them to compose routine wording.

## PR title and description

The title matches the commit subject. Write for someone who has not read the
conversation: lead with the resulting behavior and why it matters.

Write these sections once each:

1. **Summary:** what changes and why, in 2 to 4 sentences.
2. **Changes:** grouped by the areas affected (server, client, tests, workflow).
3. **How it was verified:** the actual `npm run verify` result and any other
   relevant checks. Say "Not run" and why for checks that were not run.
4. **Reviewer notes:** anything requiring close review and any trade-offs.
5. **Deploy notes:** required settings or other deployment steps, or "No deploy
   steps" when established from the changes.
6. **History:** link to the relevant build-plan section or existing history
   document; say when there is no separate history document.

Use truthful short statements for sections with nothing applicable. Unknown
information is "Not verified", never a passing result. Do not publish empty
headings or prompts for the person to fill in. Replace the default GitHub body
with the complete description; do not append duplicate descriptions. When
possible, confirm the posted title and body after publication.

## Verification and merging

Run `npm run verify` for the finished candidate before declaring work verified
or publishing it. Reuse a passing result only with evidence identifying the exact
unchanged candidate and relevant inputs. Complete records the command, result,
evidence reference and candidate identity in ignored `landing-review.md` after
tracked archival edits; Approve validates them rather than rerunning solely at
the publication handoff. Tracked changes, failed checks, missing evidence,
changed runtime/dependency inputs or uncertainty require a fresh run. Content
changes after review still require fresh drafts and approval. Report failures
honestly. The separate "PR title" workflow checks the subject format,
length and trailing full stop; imperative wording and the body need review.
There is no local Git commit hook enforcing these rules.

Use squash merge with the PR title as the resulting commit subject, followed
by GitHub's `(#<number>)`, so one work item lands as one conventional commit.
The person performs the merge.

Recommended GitHub settings: require a PR and the "verify" and "PR title"
checks before merging to `main`, and enable squash merging. These are remote
repository settings; adding these files does not configure or enforce them.

## Releases

Versions are automatic. `.github/workflows/release.yml` runs release-please
on every push to `main`. It reads the squash-merged commit subjects since
the last release, which are the PR titles above:

| Subject | Version change |
| --- | --- |
| `fix: ...` | patch (1.0.0 → 1.0.1) |
| `feat: ...` | minor (1.0.0 → 1.1.0) |
| `feat!: ...` or a `BREAKING CHANGE:` footer | major (1.0.0 → 2.0.0) |
| `chore:`, `docs:`, `test:` | none on their own, and hidden from the changelog |

- release-please keeps one PR open, titled `chore: release X.Y.Z`. It updates
  the root `package.json` version, `.release-please-manifest.json` and
  `CHANGELOG.md`, and refreshes after every merge.
- Merging that PR is the release: it creates the `vX.Y.Z` tag and a GitHub
  Release with the notes. Only the person merges it.
- Never edit versions, the manifest or `CHANGELOG.md` by hand.
- The workflow authenticates with the `RELEASE_PLEASE_TOKEN` repository
  secret. GitHub does not run CI on PRs opened with the default
  `GITHUB_TOKEN`.
- Agents never create tags, publish releases, change that secret or merge
  the release PR without the person's explicit authorization in the current
  chat.
- The baseline is `v1.0.0`, which the person tags on `main` before the first
  release-please run.
- The running version shows at the end of each page's navigation:
  `v1.0.0`, plus `· Test` for a Vercel Preview build of `main` and
  `· Preview` for other branches.
