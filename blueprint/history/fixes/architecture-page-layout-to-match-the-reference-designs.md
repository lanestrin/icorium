# Fix: Architecture page layout to match the reference designs

**Type:** Fix
**Status:** verified
**Branch:** fix/architecture-overview-and-stack-layout

## The problem

The person asked for the Architecture page's "System overview" and "Technology stack"
sections to look more like a supplied reference: the heading on the left, a row of
short cards with centred icons on the right, and the stack as compact tiles (icon,
name, purpose) instead of tall cards. The current sections stack the heading above
long cards, which makes the top of the page long for an interview walkthrough.

## The fix

- `Section` in `client/src/components/ArchitecturePage.tsx` gains an optional `side`
  layout: heading and intro on the left (16rem), content on the right from the `lg`
  breakpoint; stacked below it, so phone width is unchanged in structure.
- System overview: six short cards with a centred icon, title and one line (Import
  CSVs, Normalize, Validate, Process, Compare, Run anywhere), 2 per row on phones,
  3 on small screens, 6 on extra-large. The design principle quote stays below.
- Technology stack: one tile per `TECH` entry (icon, short `label`, short `role` as
  its purpose), wrapping to fit. Tiles are toggle buttons; the selected one (React 19
  by default) shows its full name, reasons, trade-off and files in a panel below, so
  no content is lost. `TECH` gains `label`; roles become short purposes; a few icons
  change (React `Atom`, Tailwind `Wind`, Recharts `ChartColumn`, Vitest `FlaskConical`).
- Architecture ("How it works"): the diagram follows the second reference. One row on
  extra-large screens: Browser (React) → API (Fastify) → a "CSV pipeline" panel with
  Parse, Normalize, Validate and Process → Storage (Local / Blob), with a Results bar
  below joined to Browser and Storage by elbow lines. It stacks top to bottom with
  down arrows on smaller screens. To match the reference the components merge from 14
  to 8: frontend into Browser; Local filesystem and Vercel Blob into Storage; result
  generation into Process; Comparison into Results; the generator into the API (its
  files are listed there); Shared contracts leaves the diagram (the TypeScript tile
  covers `shared/types.ts`). The request flows (Upload, Process, Compare, Generate),
  step badges and the selected-component panel stay; the panels move below the diagram.
- The side layout switches at `xl` (not `lg`) so the diagram fits on one row.
- Decisions, storage and evolution follow the third reference:
  - Decisions: a featured "Processing location (server vs. browser)" card (description,
    three ticked benefits, an amber "Trade-off: server dependency" box), then five
    compact cards (icon, question, one-line summary; three then two per row on large
    screens). Each card keeps its full earlier answer in a native `<details>` ("The full
    reasoning"), so no reasoning is lost. "Why React + Fastify instead of Next.js?"
    becomes "Why React + Fastify?" (the Next.js comparison stays in its reasoning).
  - Storage ("Hosting and storage", side layout): Local development and Optional Vercel
    deployment as ticked lists (still "Configured, not yet deployed"), and a "Storage
    options" strip: Local filesystem (default) → Vercel Blob (when a token is set) →
    S3 / Cloudflare R2 (not built, dashed). The interface operations stay in a caption.
    The routes → interface → backends diagram and its paragraph are replaced by this.
  - Evolution ("Future evolution", side layout): five compact centred cards
    (Authentication, PostgreSQL, Background jobs, Upload hardening, Monitoring) with one
    line each. The longer "today" notes (no authentication, 10 MB default, log level)
    are dropped; the upload default stays in the Fastify tile.
- Lucide icons stand in for brand logos. No new dependencies.
- Must not break: every path and package still passes the content test; keyboard
  users can reach and select each tile; no sideways page scroll at phone width.

## Build steps

- [x] **1. Side layout, overview cards and stack tiles.** Update the page and
  `client/src/ArchitecturePage.test.tsx`: six overview card titles; tile labels and
  purposes; selecting each tile shows its name, reasons, trade-off and files, with
  exactly one pressed; Enter selects a focused tile.
  *Done when:* the page and content tests pass and `npm run verify` passes.
- [x] **2. Horizontal architecture diagram.** Rewrite `NODES`, `FLOWS` and the diagram;
  tests cover the eight components in order, selecting by click and Enter, and the
  flow steps and badges.
  *Done when:* the page and content tests pass and `npm run verify` passes.
- [x] **4. Simpler, static architecture diagram** (fourth reference; replaces step 2's
  interactive diagram). "How data moves through the app": a User / Browser box, then
  React (Frontend) → Fastify (API) → Parse → Normalize, a turn line, and Validate →
  Process → Results → Storage (highlighted), as one ordered list; it stacks with down
  arrows on phones. A "How it works" card beside it lists six numbered steps. The
  request-flow buttons, step badges, selected-component panel and per-component file
  lists are removed (`NODES`, `FLOWS` and the content test's flow check go with them;
  the path check now covers the stack tiles' files).
  *Done when:* the page and content tests pass and `npm run verify` passes.
- [x] **5. Section dividers.** A thin line (`border-t border-slate-200`) divides each
  section from the one before it, with equal space above and below; the first section
  has none. The page test checks the class and that only the overview is first.
  *Done when:* the page tests pass and `npm run verify` passes.
- [x] **3. Decisions, storage and evolution.** Tests cover the featured decision (three
  benefits, trade-off), the five decision headings, opening one full reasoning, the
  storage lists and options strip, the interface caption, and the five evolution cards.
  *Done when:* the page and content tests pass and `npm run verify` passes.

## Verify

- `npm run verify`: client component and content tests, server tests, build.
- Not checked in a real browser: the visual match to the reference and phone-width
  layout need a look in the browser.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":6358,"specSha256":"390e8bbc6e026a00536acfac01c14e208ef2f023095817e7f8eaf23aeb685306","branch":"refs/heads/fix/architecture-overview-and-stack-layout","head":"ac14d8863ad1ab32c4ea65dd3b761ec671815b52","baseRef":"refs/heads/main","baseCommit":"ac14d8863ad1ab32c4ea65dd3b761ec671815b52","sourceTree":"21353dd6bfb220f2d02c7a08fdc15aacbc8963f6","landing":"pull-request","absentOptional":[]} -->
