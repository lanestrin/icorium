# Fix: Generated files never reach the R-32-rich classification

**Type:** Fix
**Status:** verified
**Branch:** fix/generated-files-never-reach-the-r-32-rich-classification

## The problem

The CSV generator draws R-32 from 33–40 % (`GENERATOR_RANGES.r32Pct` in
`server/src/lib/generate.ts`). Batch Classification calls a row *R-32-rich (demo)*
only when R-32 is at least 40 % (`DEMO_CLASS_RULES.r32RichMin`). The random draw is
always below 40, so a generated row reaches the class only when it rounds up to
40.00, which happens about 0.07 % of the time. Classifying generated files therefore
shows only *R-134a-rich* and *Balanced*. The sample files do reach the class
(Partner A follow-up has R-32 41.90 %).

## The fix

- Widen `GENERATOR_RANGES.r32Pct` from `[33, 40]` to `[33, 43]`. About 30 % of clean rows
  are then R-32-rich, and the other two classes still appear. R-134a, which makes up the
  rest, becomes 24–41 %, so it stays positive and every clean row still passes
  Composition Validation.
- Leave the classification thresholds, the mass and R-125 ranges, and how errors
  are planted unchanged.
- The pinned generator hashes in `server/src/core.test.ts` change on purpose. Update
  them to the new output.
- Update the README "Settings" table row (`R-32 33–40 %` → `R-32 33–43 %`).

## Build steps

- [x] **1. Widen the R-32 range and cover all three classes.** Change the range, update the
  README row, and re-pin the three hashes. Add a `core.test.ts` test that runs
  Classification on generated clean files for each partner (for example 50 rows,
  fixed seeds) and finds all three demo classes. Keep the existing tests passing:
  clean rows stay valid, and planted errors match validation.
  *Done when:* the new test passes for Partners A, B and C, and `npm run verify` passes.

## Verify

- `npm run verify`: server unit/API tests (including the new all-classes test and the
  re-pinned hashes), client tests and build.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":1956,"specSha256":"a5f5f11cb6cc82ed2ade0cc1887d500397887b6a62ccfbc53b7d0c24154e366f","branch":"refs/heads/fix/generated-files-never-reach-the-r-32-rich-classification","head":"e78cdb118af79c7225745b6f949f9405c9348a6f","baseRef":"refs/heads/main","baseCommit":"e78cdb118af79c7225745b6f949f9405c9348a6f","sourceTree":"ff2d8764b9ebab5c23224180976076f8c77710e3","landing":"pull-request","absentOptional":[]} -->
