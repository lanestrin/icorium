# Reclaim Studio

Interview exercise for Icorium. Upload partner refrigerant CSVs, run one of three processing functions on every row, export the result (all original columns + generated columns), and compare two result files in a chart. All data is fictional; classification rules are demo-only.

## Layout

- `client/` React 19 + Vite + Tailwind 4 + Recharts + Lucide. Screen in `src/App.tsx`, pieces in `src/components/`.
- `server/` Fastify 5 + Papa Parse + Zod, run with tsx. `src/adapters/` (partner columns and units), `src/processing/` (the three functions), `src/lib/` (csv, storage, compare), `src/routes/files.ts` (all endpoints).
- `shared/types.ts` types and the processor list used by both sides.
- `sample-data/` the person's five synthetic partner CSVs. `README.txt` there lists columns, units and the one planted error per file.
- `blueprint/build-plan.md` phases, priorities (P0/P1/P2), demo script and final checklist. Read the relevant phase before building.
- `blueprint/stack.md` stack and scope. `blueprint/reference-ui.png` the target look.

## Rules

- **Keep it simple.** No accounts, database, cloud, queues or extra layers (see "Do not add" in `blueprint/stack.md`). Prefer editing an existing file over adding one.
- **Match the reference.** UI changes follow `blueprint/reference-ui.png` and must still work at phone width with no sideways page scroll.
- **Verify before saying done.** Run `npm run verify` and report the real result. It runs server tests and the client type-check/build. Browser tests are removed while the UI is being edited; report browser behavior and visual checks separately and never claim the acceptance checklist passed from this command alone.
- **Every change keeps or adds tests.** Rules and calculations → `server/src/core.test.ts`. Endpoints and errors → `server/src/api.test.ts`. For UI changes, run the client build and report whether the affected flow was checked manually. Do not add browser tests unless the person asks to restore them.
- **Branch, draft, then wait for approval.** Follow `blueprint/commit-rules.md`: create a new branch before editing a new work item, implement and verify, then present the full commit message and PR description. Wait for explicit approval before committing. Push and publish a PR only when explicitly authorized. Never commit directly to `main`, merge or force-push. Commit messages end with the attribution line from the session.
- **Never edit the sample CSVs.** They are the person's test data; adapters adapt to them, not the other way round.
- **Results keep every original column.** Processors only append columns.
- **Result file names:** `result_<input name without .csv>_<function id>.csv`, e.g. `result_partner_a_baseline_mass.csv`. Function ids are fixed: `validation`, `mass`, `classification`. Re-running the same function on the same input replaces the earlier result (no timestamps or versions). The name is only a label: a result is recognised by its columns, so a renamed result still uploads and compares.
- Only `server/src/lib/storage.ts` touches the disk.

## Completion and approval skills

- `/complete`: run verification and present the full commit and PR drafts;
  nothing is committed or published. See `.claude/skills/complete/SKILL.md`.
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
- **Separate automated checks from manual UI checks.** Run `npm run verify` for server behavior and client compilation. Browser workflows and visual match require manual checks while browser tests are removed. State what was checked and what remains unchecked.
- **Blocked:** `Status: Blocked - <reason>.` and `Next:` names the decision or action needed.
- **Ask only for a real decision** (scope, design choice, a risk), with 2–4 options. Mark the preferred option **Recommended** and put it first, with a brief reason; if none is preferable, say so instead of labeling one.
- No vague endings: never "let me know", "shall I continue?" or "anything else?".

Examples:

| After | Status | Next |
| --- | --- | --- |
| Visual change | Changed (uncommitted); verify passed; layout not compared with the reference. | Refresh http://localhost:5173 and compare the <area> with `blueprint/reference-ui.png`. |
| Feature done | Changed (uncommitted); server tests and client build passed; UI checks reported separately. | Run `/complete` to prepare review drafts. |
| Commit | Committed and pushed; CI passed. | <the next open item in `blueprint/build-plan.md`, or a decision> |

## Extending

- New partner CSV format: add an entry to `ADAPTERS` in `server/src/adapters/index.ts`.
- New processing function: add it to `processors` in `server/src/processing/index.ts`, to `PROCESSORS` in `shared/types.ts`, and to the Zod enum in `server/src/routes/files.ts`. Add a test in `server/src/core.test.ts`.

## Commands

```bash
npm run dev       # API :3001 + UI :5173 (Vite picks the next free port if taken)
npm run verify    # server tests + client type-check and build
npm test          # unit + API tests only (~2 s)
```

- CI (`.github/workflows/ci.yml`) runs `npm run verify` on every push to `main` and every PR.

- Reset the demo data: stop the servers, delete `server/data/`, start again.
- On Windows, stopping a background `npm run dev` can leave the tsx server holding port 3001. Check the port and stop only that process.
