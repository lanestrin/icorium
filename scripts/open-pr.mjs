// Opens (or updates) the pull request for the reviewed, pushed branch through the GitHub API, with the reviewed
// title and description from blueprint/context/landing-pr.md. /approve runs it when no GitHub connector or gh is
// available. It authenticates with the credential Git already uses to push to github.com.
//
// Usage, from the repository root after pushing the branch:
//   node scripts/open-pr.mjs
// Prints the PR link, whether it was created or updated, and its checks. Exits 1 with the reason on any refusal.
//
// The token is held only in memory and sent only in the Authorization header to api.github.com. It is never
// printed, logged, put in a URL or written to a file, and error messages are scrubbed of it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** Replaces every copy of the token in a message, so an error can never reveal it. */
function scrub(message, token) {
  return token ? String(message).split(token).join('[redacted]') : String(message);
}

/**
 * Returns request(method, path, body) for the GitHub REST API. Errors name the method, path, status and GitHub's
 * message only; request headers are never included, and the token is scrubbed from anything that echoes it.
 */
export function githubRequest(token, fetchImpl = fetch) {
  return async function request(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'open-pr-script',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(scrub(`GitHub ${method} ${path} could not be sent: ${error.message}`, token));
    }
    const text = await response.text();
    if (!response.ok) {
      let message = text;
      try {
        message = JSON.parse(text).message ?? text;
      } catch {
        // GitHub's error body was not JSON; keep the raw text.
      }
      // Scrub before shortening: cutting first could leave part of an echoed token that no longer matches it.
      throw new Error(scrub(`GitHub ${method} ${path} failed with ${response.status}: ${message}`, token).slice(0, 400));
    }
    return text ? JSON.parse(text) : null;
  };
}

/**
 * Creates the PR for `branch` into main, or updates the one open PR for it, with the reviewed title and body.
 * Refuses main, a remote branch that is not at the reviewed commit, and more than one open PR. Never touches a
 * closed or merged PR. Reads the PR back and requires the title and description to match exactly.
 */
export async function openPr({ request, repo, branch, headSha, title, body }) {
  if (!branch || branch === 'main') throw new Error('push a work branch before opening its PR');
  if (!/^[0-9a-f]{40}$/.test(headSha)) throw new Error('the reviewed commit must be a full commit SHA');
  const owner = repo.split('/')[0];

  const remoteBranch = await request('GET', `/repos/${repo}/branches/${encodeURIComponent(branch)}`);
  if (remoteBranch.commit.sha !== headSha) {
    throw new Error(
      `origin/${branch} is at ${remoteBranch.commit.sha.slice(0, 7)}, not the reviewed commit ${headSha.slice(0, 7)}; push it first`,
    );
  }

  const openPrs = await request(
    'GET',
    `/repos/${repo}/pulls?state=open&base=main&head=${encodeURIComponent(`${owner}:${branch}`)}`,
  );
  const ours = openPrs.filter((pr) => pr.head.ref === branch && pr.base.ref === 'main');
  if (ours.length > 1) {
    throw new Error(`${ours.length} open PRs already exist for ${branch}: ${ours.map((pr) => `#${pr.number}`).join(', ')}`);
  }

  let action;
  let number;
  if (ours.length === 1) {
    number = ours[0].number;
    await request('PATCH', `/repos/${repo}/pulls/${number}`, { title, body });
    action = 'updated';
  } else {
    number = (await request('POST', `/repos/${repo}/pulls`, { title, body, head: branch, base: 'main' })).number;
    action = 'created';
  }

  const saved = await request('GET', `/repos/${repo}/pulls/${number}`);
  if (saved.title !== title || (saved.body ?? '').trim() !== body) {
    throw new Error(`PR #${number} was ${action}, but its title or description does not match the reviewed draft`);
  }

  const checks = await request('GET', `/repos/${repo}/commits/${headSha}/check-runs`);
  return {
    number,
    url: saved.html_url,
    action,
    checks: checks.check_runs.map((check) => ({ name: check.name, status: check.conclusion ?? check.status })),
  };
}

/** Reads the token Git already stores for github.com, without ever prompting. */
function readStoredToken() {
  let output = '';
  try {
    output = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    });
  } catch {
    // Fall through to the message below; the failed output is not shown in case it holds credential data.
  }
  const token = /^password=(.+)$/m.exec(output)?.[1];
  if (!token) throw new Error('no stored GitHub credential for https://github.com; push once with Git so it stores one');
  return token;
}

async function runFromCommandLine() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const draftPath = fileURLToPath(new URL('../blueprint/context/landing-pr.md', import.meta.url));
  const { title, body } = splitDraft(readFileSync(draftPath, 'utf8'));
  const result = await openPr({
    request: githubRequest(readStoredToken()),
    repo: githubRepo(git('remote', 'get-url', 'origin')),
    branch: git('branch', '--show-current'),
    headSha: git('rev-parse', 'HEAD'),
    title,
    body,
  });
  console.log(`PR #${result.number} ${result.action}: ${result.url}`);
  const checks = result.checks.map((check) => `${check.name}=${check.status}`).join(', ');
  console.log(`Checks: ${checks || 'none started yet'}`);
}

// Run only when started as `node scripts/open-pr.mjs`, not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runFromCommandLine().catch((error) => {
    console.error(`open-pr: ${error.message}`);
    process.exit(1);
  });
}
