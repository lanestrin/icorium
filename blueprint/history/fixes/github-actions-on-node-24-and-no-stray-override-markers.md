# Fix: GitHub Actions on Node 24 and no stray override markers

**Type:** Fix
**Status:** verified
**Branch:** `chore/node24-actions-and-override-marker-rule`

## The problem

Two leftovers from the release setup:

- **Node 20 warnings.** Every Release, CI and PR-title run warns: "Node.js 20 is deprecated … being forced to run on Node.js 24".
  - The actions behind it are `googleapis/release-please-action@v4` in `release.yml`, `actions/checkout@v4` in `ci.yml` and `pr-title.yml`, and `actions/setup-node@v4` in `ci.yml`.
  - The runs still pass, but these versions target a runtime GitHub is retiring.
- **Stray override marker.** release-please 17.3.0 reads a merged PR's description and treats everything after the commit-override start marker, up to the end marker or the end of the description, as that commit's subject. Its code is `build/src/commit.js`, `preprocessCommitMessage`.
  - PR #62's description came from a commit message that only *mentioned* the start marker. release-please then parsed "recovery for an already-merged title…" as the commit subject and couldn't read it.
  - The description was repaired on 2026-11-14 with the person's authorization.
  - Nothing in the rules stops a draft from mentioning the marker again.

## The fix

**Actions:** move each action to its first Node 24 major. That's the smallest change that removes the warning:

| Action | From | To | What changes |
| --- | --- | --- | --- |
| `googleapis/release-please-action` (`release.yml`) | `@v4` | `@v5` | The only breaking change listed in v5.0.0 is "upgrade to node24". The inputs used (`token`, `config-file`, `manifest-file`) are unchanged. |
| `actions/checkout` (`ci.yml`, `pr-title.yml`) | `@v4` | `@v5` | v5.0.0 only moves to Node 24 and needs runner 2.327.1 or newer, which GitHub-hosted runners already have. |
| `actions/setup-node` (`ci.yml`) | `@v4` | `@v5` | Node 24. v5 also turns on caching automatically when `package.json` has a `packageManager` field. Ours has none, and `ci.yml` already sets `cache: npm`, so nothing changes. |

Keep everything else in these workflows as it is: the triggers (push to `main`, `workflow_dispatch`, `pull_request`), the permissions, the token, the concurrency groups, `node-version: 24`, and the title check passing the title through an environment variable.

**Rule (`blueprint/commit-rules.md`):**
- In "Releases", next to the existing recovery steps: write the two override marker words only inside an intentional override block, in the description of the PR being corrected.
- In commit messages, PR descriptions and other drafts, call it "the commit-override block" instead. release-please treats any mention of the start marker as an override.
- `/complete` drafts follow `commit-rules.md`, so this applies to them without a skill change.

**Before merging (the person):**
- If the repository's Actions allow-list names `googleapis/release-please-action@v4` exactly, add `@v5` (or allow `@*`).
- Without that, the first Release run after merge has a startup failure, like the one on PR #60.
- Actions published by GitHub (`actions/*`) are already allowed, because CI runs today.

**Not changing:**
- application code and tests;
- `release-please-config.json`, the manifest and tags;
- open release PR #63, which release-please refreshes after this merges;
- the 12.1 plan entry that still names `@v4`. Fixing that entry is F-01, owned by 12.3.

## Build steps

- [x] **Step 1 - Node 24 actions and marker rule**
  - Update the three `uses:` lines (four places) as in the table.
  - Add the marker rule to "Releases" in `blueprint/commit-rules.md`.
  - *Done when:*
    - no workflow references `@v4` of these actions;
    - the rest of each workflow is unchanged;
    - the rule is in place;
    - `npm run verify` passes.

## Verify

**Automated:** `npm run verify` passes. It doesn't cover workflow files. A text check confirms each `uses:` line and that nothing else in the workflows changed.

**On GitHub:**
- **On this PR:** "CI" and "PR title" run on `checkout@v5` and `setup-node@v5` with no Node 20 warning.
- **After merge:** the push to `main` runs Release on `release-please-action@v5`. Expected:
  - no Node 20 warning;
  - "Successfully updated" (or "found 1 open release pull requests") for PR #63, still `chore: release 1.1.0`;
  - PR #63's changelog unchanged, because this PR is `chore:`.
- **Self-check for this fix:** its own commit message and PR description must not contain the marker words.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4477,"specSha256":"c34d787b7b0ca27d0d0999488f556275999f3c2ed17f28f28622c6a8c6871a9a","branch":"refs/heads/chore/node24-actions-and-override-marker-rule","head":"1a0eb2286f74a60d7686593d9e234e86ff1487dc","baseRef":"refs/heads/main","baseCommit":"1a0eb2286f74a60d7686593d9e234e86ff1487dc","sourceTree":"1f61834274709aed11ffe9d6ef0776df53b95c06","landing":"pull-request","absentOptional":[]} -->
