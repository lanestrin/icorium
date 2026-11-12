# Fix: Silence VS Code unknown at-rule warnings for Tailwind CSS

**Type:** Fix
**Status:** verified
**Branch:** fix/silence-vs-code-unknown-at-rule-warnings-for-tailwind-css

## The problem

VS Code's built-in CSS language service flags every Tailwind 4 directive in the
client stylesheets as `unknownAtRules` ("Unknown at rule @reference",
"Unknown at rule @apply"). Every CSS Module in `client/src/components/**` starts
with `@reference "tailwindcss";` and uses `@apply`, and `client/src/index.css`
and `client/src/styles/*.css` use `@import`, `@theme` and `@layer`, so the
Problems panel fills with dozens of warnings per file. They are editor-only:
Vite and `@tailwindcss/vite` compile these rules and `npm run verify` passes.
The repository has no `.vscode/` folder, so nothing tells the editor about them.

## The fix

Add a tracked `.vscode/settings.json` with exactly one setting:

```json
{
  "css.lint.unknownAtRules": "ignore"
}
```

It turns off only the unknown-at-rule check of VS Code's CSS linter, for this
workspace. Every other CSS lint, the app's CSS output and all runtime behaviour
stay unchanged. It works whether or not the Tailwind CSS IntelliSense extension
is installed.

**Added during implement (approved, option 2):** `npm run verify` failed on
`main` with 88 client tests reporting `Invalid Chai property: toBeInTheDocument`.
`client/src/test-setup.ts` loaded the matchers with
`import '@testing-library/jest-dom/vitest'`. That package is externalized, so
Node caches it and its `expect.extend` runs only for the first test file in a
worker. Every later file gets a fresh `expect` without the jest-dom matchers, so
any page test that runs after a `.ts` unit test fails. Each page file passes on
its own. The repair calls `expect.extend(matchers)` from the setup file itself,
which Vitest re-runs for every test file:

```ts
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';
expect.extend(matchers);
```

The old import also supplied the matcher types (the client type-check covers
test files), so the setup keeps them with `import type {} from
'@testing-library/jest-dom/vitest'`, which TypeScript erases at runtime. No test
files change.

Out of scope: re-associating `*.css` with the `tailwindcss` language (it needs
the extension, and without it files would lose CSS highlighting), adding
`.vscode/extensions.json`, and any change to the stylesheets themselves.

## Build steps

- [x] **1. Add the workspace setting.** Create `.vscode/settings.json` with the
  setting above and confirm `.gitignore` does not ignore it.
  Done when: `git status` shows `.vscode/settings.json` as a new untracked
  file, and its JSON parses (`node -e "JSON.parse(require('fs').readFileSync('.vscode/settings.json','utf8'))"`).

- [x] **2. Register the jest-dom matchers for every test file.** Replace the
  side-effect import in `client/src/test-setup.ts` with the explicit
  `expect.extend(matchers)` above.
  Done when: the full client suite (`npm test -w client`) passes, including the
  three page test files that ran after a `.ts` unit test.

## Verify

- `npm run verify` passes (server and client tests, then the type-check and build).
- In VS Code, reopen `client/src/components/modals/modals.module.css`: the
  `@reference` and `@apply` warnings no longer appear in the Problems panel.
  This is an editor check; the automated gate cannot observe it.


<!-- blueprint:completion {"schemaVersion":2,"specBytes":3423,"specSha256":"d09fc2320a65686704f68cabb780bd4f39619a9376d3d1979117f2da44396fac","branch":"refs/heads/fix/silence-vs-code-unknown-at-rule-warnings-for-tailwind-css","head":"f4ca57e4e074877a9b93da7caece4454716e8c96","baseRef":"refs/heads/main","baseCommit":"f4ca57e4e074877a9b93da7caece4454716e8c96","sourceTree":"37c32bab3d138100941da12f0717898c9a524caf","landing":"pull-request","absentOptional":[]} -->


## Try it now

1. In VS Code, reopen `client/src/components/modals/modals.module.css`. The
   "Unknown at rule @reference" and "Unknown at rule @apply" warnings no longer
   appear in the Problems panel (run "Developer: Reload Window" if they linger).
