# Fix: /approve link pre-fills the PR description

**Type:** Fix
**Status:** verified
**Branch:** `chore/approve-link-prefills-description`

## The problem

When neither a GitHub connector nor `gh` is available, `/approve` hands over a link that pre-fills only the PR **title**.

- GitHub fills the description box with the squash commit's body plus the repository's PR template comment (`.github/pull_request_template.md`).
- The person then has to select everything, delete it, and paste the drafted description from `landing-pr.md`. They asked on 2026-11-14 not to have to do this.
- **Hand-encoding is risky:** the agent builds the link by hand, so encoding a multi-kilobyte description that way would be error-prone.
- **Marker words aren't caught:** nothing checks the description for the commit-override marker words, which break release-please's parsing when they appear in passing (PR #62).

## The fix

**One small script builds the link from the reviewed draft**, and `/approve` outputs only that link.

- **`scripts/pr-link.mjs` (new, Node standard library only):**
  - **Pure function:** `prLink({ remoteUrl, branch, draft })`
    - It takes the draft's first line as the title and the rest, trimmed, as the description.
    - It returns `https://github.com/<owner>/<repo>/compare/main...<branch>?quick_pull=1&title=<encoded>&body=<encoded>`.
    - It reads the owner and repository from an `https://github.com/...` or `git@github.com:...` remote URL.
  - **Refuses:**
    - **Marker words:** a description containing either commit-override marker word throws, naming the problem, so a stray marker can't reach a PR.
    - **Bad title:** an empty title or description, or a non-GitHub remote, throws.
  - **Length:** if the URL would be longer than 8,000 characters, it returns the title-only link plus a flag saying the description must be pasted. That keeps the link within URL limits that browsers and GitHub reliably accept.
  - **Run directly:** it reads `blueprint/context/landing-pr.md`, the current branch and `origin`'s URL, and prints the link. It also prints the description only when it's too long to include.
- **`.agents/skills/approve/SKILL.md`** (also used by Claude's `/approve`): in the no-connector, no-`gh` bullet, run `node scripts/pr-link.mjs` after the push and output its link as the single next action. Output the title and description as text only when the script says the description is too long. Stop if the script refuses.
- **Tests (`server/src/pr-link.test.ts`, new):**
  - The title and description round-trip through URL decoding exactly.
  - HTTPS and SSH remotes both work.
  - Special characters are encoded: `#`, `&`, backticks, `→`, new lines.
  - The marker words are refused.
  - A missing title or description, or a non-GitHub remote, throws.
  - The fallback kicks in above 8,000 characters.
  - The draft is read the same way `/approve` reads it: first line, then the rest.
- **Must not break:**
  - `/approve` with a connector or `gh`;
  - the title check;
  - `landing-pr.md`'s format;
  - the PR template file, which is unchanged. A supplied description replaces it; if GitHub still shows it, that's handled separately.
- **Not changing:** application code, workflows and the release configuration.

## Build steps

- [x] **Step 1 - Link script and tests** - Add `scripts/pr-link.mjs` and `server/src/pr-link.test.ts` as above. *Done when:* the tests pass in `npm test -w server`, and running the script on a sample draft prints a link that decodes back to that draft.
- [x] **Step 2 - Hand-off** - Update the no-connector, no-`gh` bullet in `.agents/skills/approve/SKILL.md` to use the script's link. *Done when:* the bullet tells the agent to output the generated link as the single next action and covers the fallback and refusal cases.

## Verify

- **Automated:** `npm run verify` passes, including the new link tests.
- **On GitHub:** the next `/approve` produces one link. Opening it shows the drafted title and the full drafted description, with nothing to replace.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4035,"specSha256":"87dfc7da8da1d22ae070587106b4ce7d2c7aa5b7f6b7cf3bcc395b1467e37e9a","branch":"refs/heads/chore/approve-link-prefills-description","head":"1a0eb2286f74a60d7686593d9e234e86ff1487dc","baseRef":"refs/heads/main","baseCommit":"1a0eb2286f74a60d7686593d9e234e86ff1487dc","sourceTree":"29c1eff9095a7c2baa883fcb352d21df6b576b73","landing":"pull-request","absentOptional":[]} -->
