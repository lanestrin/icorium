// Builds the GitHub "open a pull request" link with the reviewed title and description already filled in,
// for /approve when no GitHub connector or gh is available. The draft is blueprint/context/landing-pr.md:
// its first line is the PR title and the rest is the description.
//
// Usage, from the repository root after pushing the branch:
//   node scripts/pr-link.mjs
// Prints the link. If the description is too long for a link, prints a title-only link and the description
// to paste. Exits 1 without a link when the draft cannot be published as is.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Links up to this length open reliably in browsers and on GitHub; a longer description is pasted instead.
export const MAX_URL_LENGTH = 8000;

// release-please reads everything after the start marker in a merged PR's description as that commit's
// subject, so these words must never appear in passing (see "Releases" in blueprint/commit-rules.md).
const OVERRIDE_MARKERS = ['BEGIN_COMMIT_OVERRIDE', 'END_COMMIT_OVERRIDE'];

/** Returns "owner/repo" from an HTTPS or SSH GitHub remote URL. */
export function githubRepo(remoteUrl) {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim());
  if (!match) throw new Error(`origin is not a GitHub repository: ${remoteUrl.trim()}`);
  return `${match[1]}/${match[2]}`;
}

/** Splits a PR draft into its title (first line) and description (the rest). */
export function splitDraft(draft) {
  const text = draft.replace(/\r\n/g, '\n');
  const firstBreak = text.indexOf('\n');
  const title = (firstBreak === -1 ? text : text.slice(0, firstBreak)).trim();
  const body = firstBreak === -1 ? '' : text.slice(firstBreak + 1).trim();
  if (!title) throw new Error('the PR draft has no title on its first line');
  if (!body) throw new Error('the PR draft has no description after the title');
  const marker = OVERRIDE_MARKERS.find((word) => title.includes(word) || body.includes(word));
  if (marker) {
    throw new Error(
      `the PR draft mentions ${marker}; release-please would read it as a commit override. ` +
        'Call it "the commit-override block" instead.',
    );
  }
  return { title, body };
}

/** Builds the compare link that opens a new PR from `branch` into main with the draft filled in. */
export function prLink({ remoteUrl, branch, draft }) {
  const repo = githubRepo(remoteUrl);
  if (!branch || branch === 'main') throw new Error('push a work branch before opening its PR');
  const { title, body } = splitDraft(draft);
  const branchPath = branch.split('/').map(encodeURIComponent).join('/');
  const titleOnly = `https://github.com/${repo}/compare/main...${branchPath}?quick_pull=1&title=${encodeURIComponent(title)}`;
  const withBody = `${titleOnly}&body=${encodeURIComponent(body)}`;
  if (withBody.length <= MAX_URL_LENGTH) return { url: withBody, title, body, bodyIncluded: true };
  return { url: titleOnly, title, body, bodyIncluded: false };
}

function runFromCommandLine() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const draftPath = fileURLToPath(new URL('../blueprint/context/landing-pr.md', import.meta.url));
  const link = prLink({
    remoteUrl: git('remote', 'get-url', 'origin'),
    branch: git('branch', '--show-current'),
    draft: readFileSync(draftPath, 'utf8'),
  });
  console.log(link.url);
  if (!link.bodyIncluded) {
    console.log(`\nThe description is too long for the link. Paste it into the PR:\n\n${link.body}`);
  }
}

// Run only when started as `node scripts/pr-link.mjs`, not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runFromCommandLine();
  } catch (error) {
    console.error(`pr-link: ${error.message}`);
    process.exit(1);
  }
}
