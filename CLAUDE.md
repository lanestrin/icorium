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
- **Verify before saying done.** Run `npm run verify` and report the real result. Say when a UI change was not looked at in a browser.
- **Commit and push only when the person asks.** Commit messages end with the attribution line from the session.
- **Never edit the sample CSVs.** They are the person's test data; adapters adapt to them, not the other way round.
- **Results keep every original column.** Processors only append columns.
- Only `server/src/lib/storage.ts` touches the disk.

## Ending a turn

Every task ends with these two lines, and nothing after them:

```
Status: <what is done, awaiting a decision, or blocked>
Next: <one exact command, reply or action>
```

- **Name the exact state, never a later one.** In order: changed (uncommitted), verified (`npm run verify` ran and passed), checked in the browser, committed, pushed. Say plainly when verify was not run or the UI was not looked at.
- **One next action**, the single best step. Mention an alternative above the two lines only if it is a real option.
- **Blocked:** `Status: Blocked - <reason>.` and `Next:` names the decision or action needed.
- **Ask only for a real decision** (scope, design choice, a risk), with 2–4 options and the recommended one first.
- No vague endings: never "let me know", "shall I continue?" or "anything else?".

Examples:

| After | Status | Next |
| --- | --- | --- |
| UI change | Changed (uncommitted); type-check passed; not checked in the browser. | Refresh http://localhost:5173 and compare with `blueprint/reference-ui.png`. |
| Feature done | Changed (uncommitted); verify passed. | Reply "commit" to commit and push. |
| Commit | Committed and pushed to `origin/main`. | <the next item from the acceptance checks> |

## Extending

- New partner CSV format: add an entry to `ADAPTERS` in `server/src/adapters/index.ts`.
- New processing function: add it to `processors` in `server/src/processing/index.ts`, to `PROCESSORS` in `shared/types.ts`, and to the Zod enum in `server/src/routes/files.ts`. Add a test in `server/src/core.test.ts`.

## Commands

```bash
npm run dev       # API :3001 + UI :5173 (Vite picks the next free port if taken)
npm run verify    # server tests + client type-check and build
npm test          # server tests only
```

- Reset the demo data: stop the servers, delete `server/data/`, start again.
- On Windows, stopping a background `npm run dev` can leave the tsx server holding port 3001. Check the port and stop only that process.
