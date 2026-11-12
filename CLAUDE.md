# Reclaim Studio

Interview exercise for Icorium. Upload partner refrigerant CSVs, run one of three processing functions on every row, export the result (all original columns + generated columns), and compare 2 to 5 result files in charts. All data is fictional; classification rules are demo-only.

Shared agent instructions (proportional engineering, the Blueprint workflow,
commands and attribution) live in **AGENTS.md**. Blueprint skills load
planning context, coding standards and the active spec only when needed.

@AGENTS.md

## Layout

- `client/` React 19 + Vite + Tailwind 4 + Recharts + Lucide. File workspace in `src/App.tsx` (its `Root` shows `src/components/GeneratorPage.tsx` at `/generator` and `src/components/ArchitecturePage.tsx` at `/architecture`), pieces in `src/components/`.
- `server/` Fastify 5 + Papa Parse + Zod, run with tsx. `src/adapters/` (partner columns and units), `src/processing/` (the three functions), `src/lib/` (csv, storage, compare), `src/routes/files.ts` (all endpoints).
- `shared/types.ts` types and the processor list used by both sides.
- `sample-data/` the person's five synthetic partner CSVs. `README.txt` there lists columns, units and the one planted error per file.
- `blueprint/build-plan.md` phases, priorities (P0/P1/P2), demo script and final checklist. Read the relevant phase before building.
- `blueprint/stack.md` stack and scope. `blueprint/reference-ui.png` the target look.

## Rules

- **Keep it simple.** No accounts, database, cloud, queues or extra layers (see "Do not add" in `blueprint/stack.md`). Prefer editing an existing file over adding one.
- **Match the reference.** UI changes follow `blueprint/reference-ui.png` and must still work at phone width with no sideways page scroll.
- **Verify before saying done.** Run `npm run verify` and report the real result. It runs server unit/API tests, client unit/component tests and the client type-check/build. Manual testing is not a completion requirement. Component tests do not establish visual correctness in a real browser.
- **Every change keeps or adds tests.** Rules and calculations belong in server unit tests; endpoints and errors in API tests. UI changes require unit/component coverage using Vitest and React Testing Library. Exercise user-visible behavior, async success/failure and relevant keyboard interactions. Do not add browser tests unless requested.
- **Branch, draft, then wait for approval.** Follow `blueprint/commit-rules.md`: create a new branch before editing a new work item, implement and verify, then present the full commit message and PR description. Wait for explicit approval before committing. Push and publish a PR only when explicitly authorized. Never commit directly to `main`, merge or force-push. No AI attribution in commits or PRs (see AGENTS.md).
- **Never edit the sample CSVs.** They are the person's test data; adapters adapt to them, not the other way round.
- **Results keep every original column.** Processors only append columns.
- **File IDs, not names, identify files** (`blueprint/build-plan.md` M11). Every upload gets a new six-digit base ID counting up from `100001`, never reused. A result's ID is its input's ID plus its function's fixed code: `-V` validation, `-M` mass, `-C` classification (`101010-M`). Re-running the same function on the same input replaces that result and keeps its ID (no timestamps or versions), only when the request sends `replace: true`; otherwise `POST /api/process` answers 409 naming the existing result. An uploaded result gets a new base ID plus its code, and is linked to an original (`sourceId`) only when its `file_id` names an input in the workspace and its original columns and values match that input exactly; otherwise it keeps that source ID as `importedFrom` provenance and stays unlinked. Names are labels only: results are still named `result_<input name without .csv>_<function id>.csv`, and a result is recognised by its columns, so a renamed result still uploads and compares. Nothing links, replaces or looks files up by name. The ID travels with the data: stored inputs carry a `file_id` column and results add `result_id` as their first generated column; uploads overwrite these with the new IDs.
- Only `server/src/lib/storage.ts` touches the disk.
- The Architecture page (`client/src/components/ArchitecturePage.tsx`) describes the real stack. When a dependency, route, limit or file it names changes, update the page; `client/src/architecture-content.test.ts` fails if a named path, package or quoted limit no longer matches.

## Completion and approval skills

- `/complete`: the Blueprint completion step (safety pass, history logging
  under `blueprint/history/`, commit and PR drafts). It never stages, commits,
  pushes, publishes or merges. Final tracked archival edits require Verify;
  unchanged prepared candidates reuse their recorded passing evidence.
  See `.claude/skills/complete/SKILL.md`.
- `/approve`: only the person invokes it after reviewing the drafts. It
  authorizes one commit, push and PR creation/update. See
  `.claude/skills/approve/SKILL.md`. Never run it automatically.
- Codex equivalents: `$complete` and `$approve` in `.agents/skills/`.

## Ending a turn

Every task ends with these two lines, and nothing after them:

```
Status: <what is done, awaiting a decision, or blocked>
Next: <one exact command, reply or action>
```

- **Name the exact state, never a later one.** In order: changed (uncommitted), verified (`npm run verify` ran and passed), committed, pushed, CI passed. Say plainly when verify was not run.
- **One next action**, the single best step: real work or a real decision. Mention an alternative above the two lines only if it is a real option.
- **Report automated evidence accurately.** `npm run verify` covers server unit/API tests, client unit/component tests and client compilation. Manual UI checklists are not required; do not claim browser or visual checks passed from a jsdom test.
- **Blocked:** `Status: Blocked - <reason>.` and `Next:` names the decision or action needed.
- **Ask only for a real decision** (scope, design choice, a risk), with 2–4 options. Mark the preferred option **Recommended** and put it first, with a brief reason; if none is preferable, say so instead of labeling one.
- No vague endings: never "let me know", "shall I continue?" or "anything else?".

Examples:

| After | Status | Next |
| --- | --- | --- |
| UI change | Changed (uncommitted); unit/component tests and build passed; browser visuals not verified. | Run `/complete` to prepare review drafts. |
| Feature done | Changed (uncommitted); server unit/API tests, client unit/component tests and build passed. | Run `/complete` to prepare review drafts. |
| Commit | Committed and pushed; CI passed. | <the next open item in `blueprint/build-plan.md`, or a decision> |

## Extending

- New partner CSV format: add one entry to `ADAPTERS` in `shared/types.ts` (its id, name, description, columns, unit factors and number formats). Uploads, processing and the CSV generator all read it; `server/src/adapters/index.ts` matches and normalizes rows.
- New processing function: add it to `processors` in `server/src/processing/index.ts` and to `PROCESSORS` in `shared/types.ts` (its id, code and labels). The API's accepted functions and the file table's label follow from `PROCESSORS`. Add a test in `server/src/core.test.ts`.

## Commands

See **Commands** in AGENTS.md (dev, test, verify, CI, demo reset).
