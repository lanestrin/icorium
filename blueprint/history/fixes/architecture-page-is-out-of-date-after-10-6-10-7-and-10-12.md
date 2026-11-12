# Fix: Architecture page is out of date after 10.6, 10.7 and 10.12

**Type:** Fix
**Status:** verified
**Branch:** fix/architecture-page-is-out-of-date-after-10-6-10-7-and-10-12

## The problem

`client/src/components/ArchitecturePage.tsx` describes the real stack. Six of its
statements no longer match the code, and two parts repeat what the page already says:

| # | Where | Says | True now |
|---|---|---|---|
| 1 | Zod card trade-off | Schemas must be kept in step with the types, "e.g. the processor list" | Since 10.6 the API's allowed functions come from `PROCESSORS` |
| 2 | Fastify card; "Upload hardening" card | Uploads capped at 10 MB | 10 MB is the default; `MAX_UPLOAD_MB` changes it (10.12) |
| 3 | "Monitoring and logging" card | Server logs warnings and errors only | That is the default; `LOG_LEVEL` changes it (10.12) |
| 4 | Partner normalization node | One adapter entry; lists only `server/src/adapters/index.ts` | Since 10.7 the entry is in `ADAPTERS` in `shared/types.ts` |
| 5 | Storage node; storage diagram | Operations `list · get · read · patch · create · put` | New results are saved with `createAt`; `put` only on a confirmed replace |
| 6 | Process flow, last step | "…replacing an earlier run" | Only when the person confirms (`replace: true`); otherwise 409 |

Repetition:
- The Trade-offs table (section 6) restates the stack-card trade-offs and the
  decisions; only "No authentication" is not said elsewhere.
- The "S3-compatible object storage" Evolution card repeats the Storage section's
  "not built" S3 / R2 box and the paragraph under it.

## The fix

Copy-only changes on the page, plus matching tests. No new components or dependencies.

- **1** Zod trade-off: request schemas are a second definition beside the TypeScript
  types; the allowed functions and partners are derived from the shared lists, but
  the field rules (limits, messages) are written in the schemas.
- **2** Fastify card: "capped at 10 MB per file by default (`MAX_UPLOAD_MB`)". Upload
  hardening card: "limited to 10 MB by default".
- **3** Monitoring card: "Today the server logs warnings and errors by default
  (`LOG_LEVEL` raises it)."
- **4** Partner normalization node: say the formats are `ADAPTERS` entries in
  `shared/types.ts`, matched and normalized in `server/src/adapters/index.ts`; list
  both files. Shared contracts node: add the partner formats to what is defined once.
- **5** Storage node and diagram: name `createAt` (saves a new result only if its ID
  is free) and say `put` replaces a result when the person confirms.
- **6** Process flow step: "…replacing an earlier run only when the person confirms;
  otherwise the server answers 409".
- Remove the Trade-offs section, its `TRADEOFFS` data and its "Trade-offs" link in
  "On this page"; renumber Evolution to "6 · Evolution". Move the authentication cost
  into the "Authentication and access control" Evolution card (anyone can use every
  feature, which suits the demo but not unrestricted multi-user use).
- Remove the "S3-compatible object storage" Evolution card. Keep the Storage section's
  S3 / R2 box and paragraph. Drop any icon import left unused.
- Must not break: every remaining path, package and limit still passes
  `client/src/architecture-content.test.ts`; layout still has no sideways scroll at
  phone width (no layout changes are made).

## Build steps

- [x] **1. Correct the page and remove the repeats.** Apply the six corrections and
  two removals above. Update `client/src/ArchitecturePage.test.tsx`: section links
  without "Trade-offs", no Trade-offs table, Evolution text for the upload default,
  log level and authentication, no S3 Evolution card. Extend
  `client/src/architecture-content.test.ts` so the newly quoted facts must match the
  code: `MAX_UPLOAD_MB` and `LOG_LEVEL` in `server/src/app.ts`, `createAt` in the
  `Storage` interface in `server/src/lib/storage.ts`, `ADAPTERS` in `shared/types.ts`,
  and the processor enum derived from `PROCESSORS` in `server/src/routes/files.ts`.
  *Done when:* the page tests and content tests pass, and `npm run verify` passes.

## Verify

- `npm run verify`: client component and content tests (updated), server tests, build.
- Not checked in a real browser; the change is text and removals only.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":4285,"specSha256":"6d09cc9d206925dc1190246de44b134fd6602ade29bc3824293dedbdf42b3502","branch":"refs/heads/fix/architecture-page-is-out-of-date-after-10-6-10-7-and-10-12","head":"beb2113c1c50753d44628167228296f7cb5b9e72","baseRef":"refs/heads/main","baseCommit":"beb2113c1c50753d44628167228296f7cb5b9e72","sourceTree":"cd7cc4bc316884d9e7a03bfdab8c3ebb47c45416","landing":"pull-request","absentOptional":[]} -->
