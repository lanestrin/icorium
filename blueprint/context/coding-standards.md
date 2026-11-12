# Coding Standards

> Tuned by `/adopt` on 2026-11-11 to the conventions the Reclaim Studio code
> already follows. Project rules in `CLAUDE.md` (File IDs, storage, the
> Architecture page, extending adapters and processors) take precedence.

## TypeScript

- `strict` is on in client and server. No `any`; use precise types or `unknown`.
- Types shared by client and server live in `shared/types.ts` (file metadata,
  processor list, comparison shapes). Import them with `import type`.
- Use inference where obvious, explicit types at module boundaries.

## React (client)

- React 19 function components and hooks; no state library, no router library.
  `App` in `client/src/App.tsx` picks the page from the URL.
- Each page in `client/src/pages/` owns its state. The file workspace's state is
  split into hooks in `client/src/hooks/` (one hook per file, named after it);
  components in `client/src/components/` receive props. Prefer editing an
  existing file over adding one.
- Pure logic (rules, formats, calculations) lives in `client/src/lib/`, not in
  components, so it can be unit tested without rendering.
- All HTTP calls go through the `api` object in `client/src/lib/api.ts`, which turns
  non-OK responses into an `Error` carrying the server's `message`.
- Ignore stale responses (list, preview) rather than letting late replies win.
- Keyboard access and ARIA (`aria-sort`, dialog focus, menus with arrow keys and
  Escape) are part of done, not polish.

## Server

- Fastify 5 with `@fastify/multipart`; every endpoint is in
  `server/src/routes/files.ts`. `server/src/app.ts` builds the app so tests can
  use `app.inject`.
- Validate request bodies and queries with Zod at the route.
- Partner columns and units live in `server/src/adapters/`; the three processors
  in `server/src/processing/`; CSV, storage, comparison and generation in
  `server/src/lib/`.
- Only `server/src/lib/storage.ts` (and its Blob variant `blob-storage.ts`) touches
  storage. Processing logic stays independent of storage.
- Processors only append columns; results keep every original column and value.

## File Organization

- Client: `client/src/App.tsx` (page from the URL), `client/src/pages/<Name>Page.tsx`,
  `client/src/components/<Name>.tsx`, `client/src/hooks/use<Name>.ts` and
  `client/src/lib/<name>.ts`. Each test sits next to the file it tests
  (`<file>.test.ts(x)`); `client/src/hooks/hooks.test.ts` covers the hooks.
- Server: `server/src/{adapters,processing,lib,routes}/`; tests in
  `server/src/core.test.ts` (unit), `api.test.ts` (endpoints),
  `blob-storage.test.ts`.
- `sample-data/` is the person's test data. Never edit it.

## Naming

- Components: PascalCase files (`FileTable.tsx`); other modules lowercase or
  kebab-case (`compare-view`, `blob-storage.ts`).
- Functions and variables: camelCase. Fixed tables of facts: SCREAMING_SNAKE_CASE
  (`ADAPTERS`, `PROCESSORS`, `GENERATOR_PARTNERS`).
- Branches: `feature/<id>-<name>`, `fix/<name>`, `chore/`, `refactor/`, `perf/`,
  `docs/`, `test/` (see `blueprint/commit-rules.md`).

## Styling

- Tailwind CSS 4 via `@tailwindcss/vite`, CSS-first config in
  `client/src/index.css`; no `tailwind.config.js`. Icons from Lucide React.
- Light, Apple-inspired look from `blueprint/reference-ui.png`. Must work at phone
  width with no sideways page scroll.
- Charts use Recharts, labelled with units and whether values are a sum, mean or count.

## Data and storage

- No database. Local files under `server/data/` in development (delete it to reset
  the demo); private Vercel Blob when deployed.
- Files are identified by File ID, never by name (see `CLAUDE.md`).
- Reads have no side effects; one-off reconciliation runs at startup.

## Error Handling

- Server: throw an HTTP error with a clear, actionable message (400 for bad
  input, 404 for unknown files, 409 for a result that exists without
  `replace: true`). File-level problems reject the upload; row-level problems keep
  the row with its reason and skip its calculation.
- Client: show the server's message where the action happened (row **Error**
  status, dialog, toast). Never fail silently.

## Testing

**Testing is a gate.** `AGENTS.md` declares `Test` (`npm test`) and `Verify`
(`npm run verify`). Every change keeps or adds tests in the same diff:

- Rules and calculations (adapters, validation, mass, classification, CSV
  escaping, comparison maths, generator): server unit tests in `core.test.ts`.
- Endpoints, status codes and error messages: API tests in `api.test.ts` with
  `app.inject`.
- UI changes: client unit/component tests with Vitest, React Testing Library and
  `user-event` in jsdom. Exercise user-visible behavior, async success and failure,
  and relevant keyboard interactions.
- The Architecture page must match the code; `architecture-content.test.ts` fails
  when a named path, package or quoted limit drifts.
- Run `npm run verify` once when the changes are complete and report the real
  result. It runs server and client tests, then the client type-check and build.

Component tests in jsdom do not prove visual correctness or chart drawing in a
real browser. There is no browser test harness; do not add one unless requested.
Manual click-through testing is not a completion requirement.

## Code Quality

- No commented-out code, unused imports or variables.
- Keep functions cohesive and short; explicit control flow over clever shortcuts.
- Each fact (names, limits, codes) is defined once.

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
