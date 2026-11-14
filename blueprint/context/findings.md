# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to land while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P3] open - Build-plan 12.1 entry contradicts the spec on the v1.0.0 tag timing and label mechanism

**File:** blueprint/build-plan.md:828-831
**Found:** 2026-11-14 by /audit (scope: current; lens: quality)
**Why it matters:** The shipped 12.1 build-plan entry says the person tags "the merge commit" `v1.0.0` after merge, puts `bootstrap-sha` in `release-please-config.json`, and defines `__APP_VERSION__`. The approved spec, `blueprint/commit-rules.md` and the code instead tag current `main` (before this PR) as `v1.0.0`, use no `bootstrap-sha`, and expose `import.meta.env.VITE_APP_VERSION`. Tagging the merge commit, as the plan says, would fold this PR's `feat:` commit into 1.0.0 and change what the first release PR proposes; a reader following the plan instead of the PR deploy notes would get a different baseline than the spec intends.
**Suggested fix:** Edit the 12.1 entry in `blueprint/build-plan.md` to match the spec: tag current `main` before merging, no `bootstrap-sha`, `VITE_APP_VERSION`/`VITE_APP_ENV` through `define`. Docs only; no current requirement is lost.
**Resolution:**
