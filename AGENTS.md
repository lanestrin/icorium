# Reclaim Studio agent instructions

Instructions for AI coding agents working in this project. This is the cross-tool
entry point. Codex, Google Antigravity, and OpenCode read `AGENTS.md`. Claude Code
reads `CLAUDE.md`, which imports this file. Read `CLAUDE.md` for project layout,
implementation rules (File IDs, storage, Architecture page) and how to extend
the app. Follow `blueprint/commit-rules.md` for the complete Git workflow.

Claude Code, Codex, and every other AI tool must not add AI attribution to
commits or pull requests, including AI `Co-Authored-By` trailers or generated-by
signatures. Preserve genuine human attribution. See
[Commit and PR attribution](blueprint/context/ai-interaction.md#commit-and-pr-attribution)
for optional tool settings.

## What this is

Reclaim Studio is an interview exercise for Icorium. A non-technical user uploads
partner refrigerant CSVs, runs one of three processing functions on every row,
exports a result CSV (all original columns plus generated columns) and compares
2 to 5 result files in charts. All data is fictional; classification rules are
demo-only.

The project uses the **AI Blueprint**, a workflow layer (skills, plans and
context files), not an app skeleton. Never run a framework scaffolder here.

## Proportional engineering

Build for established requirements, not hypothetical scale, threats, or future
flexibility. Reuse existing code, the standard library, native platform features,
and installed dependencies before adding machinery.

- Unknown scale or extensibility defaults to the smaller reversible design. Do
  not infer enterprise, multi-tenant, hostile-user, or compliance requirements.
- Derive trust and data-integrity boundaries from actual reachability: untrusted
  input, auth/session/ownership, shared persisted data, destructive operations,
  payments, secrets, and sensitive data.
- Ask only when an unknown materially changes behavior, architecture, persisted
  data, interoperability, a real security boundary, or cost. Otherwise choose the
  simplest repository-native implementation.
- Add an abstraction, dependency, service, configuration surface, compatibility
  layer, or security mechanism only for a current requirement.
- Simplicity never removes real trust-boundary validation, data-loss prevention,
  accessibility, explicit security requirements, configured tests, or project rules.

Write straightforward, readable code that a junior developer can follow. Use
descriptive names, cohesive functions, explicit control flow, and existing
project patterns. Avoid clever shortcuts and unnecessary abstractions.

## Read these when relevant

- `blueprint/config.json` - deterministic project workflow settings
- `blueprint/workflow.md` - workflow reference for configuration, skills, dashboard activity, and checks
- `blueprint/context/project-overview.md` - the project's source of truth
- `blueprint/context/coding-standards.md` - read before changing code
- `blueprint/context/ai-interaction.md` - read when running the Blueprint workflow
- `blueprint/context/current-feature.md` - the one feature, fix, or rollback being built in this checkout
- `blueprint/build-plan.md` - stable feature IDs, build order and per-item detail
- `blueprint/stack.md` - stack, scope and the "Do not add" list
- `blueprint/commit-rules.md` - branches, commit messages, PRs and approval

Reuse relevant context already loaded in the session.

## Workflow

Build one feature, fix, or rollback at a time, behind review gates. The feature
loop is `/feature` (or `/fix`, `/rollback`) -> `/implement` -> `/complete` ->
`/approve`; approve the spec before Implement. Check and Audit run when explicitly
requested or selected by configured quality gates. Required independent review
and existing pending reviews remain enforced. Complete prepares the archive and
publication drafts; only separately authorized Approve commits, pushes and
publishes the PR. The person performs the merge. Each command is a local
skill at `.agents/skills/<skill>/SKILL.md` or `.claude/skills/<skill>/SKILL.md`
that carries its own instructions. Claude Code and Google Antigravity use slash
commands such as `/feature`, Codex uses `$feature`, and other tools can follow
the matching `SKILL.md` when asked.

Skills: `adopt`, `approve`, `audit`, `blueprint-doctor`, `blueprint-status`,
`brief`, `check`, `ci`, `complete`, `debug`, `discovery`, `explore`, `feature`,
`fix`, `implement`, `onboard`, `overview`, `prototype`, `release`, `rollback`,
and `tests`, plus the explicit-only `autopilot` and `continuous`.

When asked what to build next, choose the first unchecked item in
`blueprint/build-plan.md` with satisfied dependencies and report its ID, title,
branch, reason and starting action. Never infer completion from an existing file
or a passing build alone.

- Keep one active work item per checkout. Parallel work needs its own clone or
  Git worktree and branch; never replace another worker's active spec.
- For each new work item, create a descriptive branch before editing. Never
  commit directly to `main`, merge or force-push.
- `/approve` (`$approve`) is invoked only by the person after reviewing the
  completion drafts. It authorizes one commit and push for that work item, as
  documented in the commit rules. Never invoke it automatically.
- `blueprint/config.json` can make review or verification stricter and tune
  local workflow settings. It never grants permission to commit, merge, push,
  deploy, publish, send, delete data, waive a failing check, or accept a finding.
- Never create or edit `blueprint/.state/run.json` directly. Tracked skills
  record dashboard activity through the managed helper.

## Commands

npm workspaces (`client`, `server`); Node.js 24.

- Dev server: `npm run dev` (API on :3001, UI on http://localhost:5173; Vite picks the next free port if taken)
- Test: `npm test` (server unit/API tests and client unit/component tests, Vitest)
- Verify: `npm run verify` (all tests, then the client type-check and production build)
- Client build only: `npm run build -w client`

There is no lint or format command and no browser test harness. Run
`npm run verify` once after the changes are complete; rerun only if it fails or
tracked files change afterward.

Reuse passing Verify evidence only for a provably unchanged tested candidate,
including tracked file contents, modes, deletions and intended untracked
additions. Spec and archival edits invalidate reuse. Complete records the exact
command, successful result, evidence reference and final candidate identity in
the ignored `blueprint/context/landing-review.md`; Approve validates that evidence
instead of automatically rerunning Verify. Failure, missing evidence, changed
runtime/dependency inputs or uncertain identity requires a fresh run. A matching
HEAD or clean status alone is insufficient.

- CI (`.github/workflows/ci.yml`) runs `npm run verify` on every push to `main`
  and every PR; `.github/workflows/pr-title.yml` checks PR titles with
  `scripts/check-pr-title.ps1`; `.github/workflows/release.yml` runs
  release-please on every push to `main` (see "Releases" in
  `blueprint/commit-rules.md`).
- Reset the demo data: stop the servers, delete `server/data/`, start again.
- On Windows, stopping a background `npm run dev` can leave the tsx server
  holding port 3001. Check the port and stop only that process.
