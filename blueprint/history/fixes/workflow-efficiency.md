# Fix: Workflow efficiency

**Type:** Fix
**Status:** verified
**Branch:** fix/workflow-efficiency

## The problem

Implement, Complete and Approve can each require a full Verify run for the same
work. Complete also claims commit and publication responsibilities assigned to
Approve by project rules. The documented linear workflow makes optional Check
and Audit gates look mandatory. These contradictions add repeated work and
unnecessary handoffs.

## The fix

Align both installed skill adapters and project guidance around three changes:

- Reuse successful Verify evidence for an unchanged candidate. Record the exact
  command, result and tested candidate in existing completion evidence. Rerun
  after tracked content changes, failures, missing evidence, or uncertainty about
  whether the candidate is unchanged. Preserve the existing conservative AGENTS
  rule; do not introduce an exception for archival changes in this work.
- Complete performs final checks, archival and review-draft preparation, then
  stops. Only an explicitly invoked Approve, or equivalent explicit authorization
  permitted by project rules, commits, pushes and creates or updates the PR.
- Document Check and Audit as conditional gates controlled by configuration or
  explicit requests. Preserve required independent review, existing pending
  review gates, blocking findings and publication approval.

Keep existing archival recovery and exact reviewed-content checks. Preserve
Continuous Mode's separate explicit lifecycle. Do not change application code,
dependencies, configured gate values, test requirements, independent-review
triggers, commit/PR templates, or add a lightweight bypass path in this fix.

## Build steps

- [x] Align verification reuse in Implement, Complete and Approve in both adapter
  trees and the project guidance. Done when unchanged candidates can reuse
  evidenced passing Verify results, while changed or uncertain candidates rerun
  Verify and final completion evidence covers the prepared candidate.
- [x] Align Complete's description, instructions and applicable references with
  the project-specific prepare-only handoff to Approve. Done when normal and
  recovery paths cannot commit or publish through Complete, and Approve retains
  exact path/content validation and explicit authorization.
- [x] Clarify the normal workflow and conditional gates in AGENTS, workflow and
  interaction guidance; remove only resolved related overview uncertainty.
  Done when guidance consistently describes spec approval, implementation,
  conditional checks/review, completion drafts and explicit publication approval,
  with matching shared skill adapters.

## Approved scope addition

The person approved including the five existing historical-spec moves from
blueprint/features/ to blueprint/history/features/: 7.1 and 8.1 through 8.4.
Their contents remain unchanged. Update their five build-plan links and refresh
only the overview fingerprint so the moves leave valid references.

- [x] Confirm the five destination files retain the original contents and each
  build-plan reference resolves to its new location.

## Verify

- Review changed instructions and their targeted references for contradictory
  mandatory reruns, publication ownership and unconditional Check/Audit steps.
- Compare affected shared skills and references across .agents and .claude.
- Review scenarios: unchanged implementation, archival changes after Verify,
  changed source after drafts, failed Verify, sensitive review and interrupted
  completion. No stale evidence or approval may be reused.
- Run npm run verify once after all tracked implementation edits are complete;
  rerun only on failure or later tracked changes. No browser check is needed for
  these workflow-only changes.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":3781,"specSha256":"737cd2d8140673fedb2046c4dc7c5922652c5e245eebb7c09cdb9381b3826f47","branch":"refs/heads/fix/workflow-efficiency","head":"f6ebeb15d83bd918c2acfb2174505bb6fbdb5858","baseRef":"refs/heads/main","baseCommit":"f6ebeb15d83bd918c2acfb2174505bb6fbdb5858","sourceTree":"6c0d8557f0e5ca90386ba098402812466d35962f","landing":"pull-request","absentOptional":[]} -->
