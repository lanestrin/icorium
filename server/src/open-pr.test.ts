// Tests for scripts/open-pr.mjs, which /approve uses to create or update the PR through the GitHub API. The script
// lives in scripts/, which has no test runner, so its tests sit here where `npm run verify` runs them. A fake
// GitHub stands in for the API; nothing here touches the network or a real credential.
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript module without type declarations
import { githubRepo, githubRequest, openPr, splitDraft } from '../../scripts/open-pr.mjs';

const repo = 'lanestrin/icorium';
const branch = 'chore/approve-opens-pr-through-github-api';
const headSha = 'a'.repeat(40);
const title = 'chore: open the PR through the GitHub API';
const body = '## Summary\n\nOpens the PR with `#64` & "quotes" → done.';

type Pr = { number: number; title: string; body: string; state: string; head: { ref: string }; base: { ref: string } };

/** A tiny in-memory GitHub that records every call. */
function fakeGitHub({ remoteSha = headSha, pulls = [] as Pr[], saveBodyAs }: { remoteSha?: string; pulls?: Pr[]; saveBodyAs?: string } = {}) {
  const calls: string[] = [];
  const request = async (method: string, path: string, payload?: { title: string; body: string; head?: string }) => {
    calls.push(`${method} ${path}`);
    if (method === 'GET' && path === `/repos/${repo}/branches/${encodeURIComponent(branch)}`) return { commit: { sha: remoteSha } };
    if (method === 'GET' && path.startsWith(`/repos/${repo}/pulls?`)) return pulls.filter((pr) => pr.state === 'open');
    if (method === 'POST' && path === `/repos/${repo}/pulls`) {
      const pr = { number: 70, title: payload!.title, body: payload!.body, state: 'open', head: { ref: payload!.head! }, base: { ref: 'main' } };
      pulls.push(pr);
      return pr;
    }
    const number = Number(/\/pulls\/(\d+)$/.exec(path)?.[1]);
    const pr = pulls.find((candidate) => candidate.number === number);
    if (method === 'PATCH' && pr) return Object.assign(pr, { title: payload!.title, body: payload!.body });
    if (method === 'GET' && pr) return { ...pr, body: saveBodyAs ?? pr.body, html_url: `https://github.com/${repo}/pull/${number}` };
    if (method === 'GET' && path === `/repos/${repo}/commits/${headSha}/check-runs`) {
      return { check_runs: [{ name: 'verify', status: 'in_progress', conclusion: null }, { name: 'PR title', status: 'completed', conclusion: 'success' }] };
    }
    throw new Error(`unexpected call ${method} ${path}`);
  };
  return { request, calls, pulls };
}

const openPrFor = (request: unknown, overrides: Record<string, unknown> = {}) =>
  openPr({ request, repo, branch, headSha, title, body, ...overrides });

describe('open PR', () => {
  it('creates the PR when none is open and reads it back', async () => {
    const github = fakeGitHub();
    const result = await openPrFor(github.request);
    expect(result).toEqual({
      number: 70,
      url: `https://github.com/${repo}/pull/70`,
      action: 'created',
      checks: [{ name: 'verify', status: 'in_progress' }, { name: 'PR title', status: 'success' }],
    });
    expect(github.pulls[0]).toMatchObject({ title, body, head: { ref: branch } });
  });

  it('updates the one open PR instead of creating another', async () => {
    const github = fakeGitHub({ pulls: [{ number: 65, title: 'old', body: 'old body', state: 'open', head: { ref: branch }, base: { ref: 'main' } }] });
    const result = await openPrFor(github.request);
    expect(result).toMatchObject({ number: 65, action: 'updated' });
    expect(github.calls).not.toContain(`POST /repos/${repo}/pulls`);
    expect(github.pulls).toHaveLength(1);
    expect(github.pulls[0]).toMatchObject({ title, body });
  });

  it('never touches a closed or merged PR for the branch', async () => {
    const closed = { number: 60, title: 'old', body: 'old body', state: 'closed', head: { ref: branch }, base: { ref: 'main' } };
    const github = fakeGitHub({ pulls: [closed] });
    const result = await openPrFor(github.request);
    expect(result).toMatchObject({ number: 70, action: 'created' });
    expect(closed).toMatchObject({ title: 'old', body: 'old body' });
    expect(github.calls).not.toContain(`PATCH /repos/${repo}/pulls/60`);
  });

  it('stops when more than one PR is open for the branch', async () => {
    const pr = (number: number) => ({ number, title: 't', body: 'b', state: 'open', head: { ref: branch }, base: { ref: 'main' } });
    const github = fakeGitHub({ pulls: [pr(1), pr(2)] });
    await expect(openPrFor(github.request)).rejects.toThrow('2 open PRs already exist');
    expect(github.calls.some((call) => call.startsWith('PATCH') || call.startsWith('POST'))).toBe(false);
  });

  it('stops when the remote branch is not at the reviewed commit', async () => {
    const github = fakeGitHub({ remoteSha: 'b'.repeat(40) });
    await expect(openPrFor(github.request)).rejects.toThrow('not the reviewed commit');
    expect(github.calls).toHaveLength(1);
  });

  it('stops on main and on a short commit SHA without calling GitHub', async () => {
    const github = fakeGitHub();
    await expect(openPrFor(github.request, { branch: 'main' })).rejects.toThrow('work branch');
    await expect(openPrFor(github.request, { headSha: 'abc1234' })).rejects.toThrow('full commit SHA');
    expect(github.calls).toHaveLength(0);
  });

  it('fails when the saved description does not match the draft', async () => {
    const github = fakeGitHub({ saveBodyAs: 'something else' });
    await expect(openPrFor(github.request)).rejects.toThrow('does not match the reviewed draft');
  });
});

describe('PR draft and remote', () => {
  it('splits the draft into title and description, with Windows line endings too', () => {
    expect(splitDraft(`${title}\n\n${body}\n`)).toEqual({ title, body });
    expect(splitDraft(`${title}\r\n\r\n${body.replace(/\n/g, '\r\n')}\r\n`)).toEqual({ title, body });
  });

  it.each(['BEGIN_COMMIT_OVERRIDE', 'END_COMMIT_OVERRIDE'])('refuses a draft that mentions %s', (marker) => {
    expect(() => splitDraft(`${title}\n\nDocument the ${marker} recovery.`)).toThrow('commit-override block');
  });

  it('refuses a draft without a title or a description', () => {
    expect(() => splitDraft('\n\n## Summary')).toThrow('no title');
    expect(() => splitDraft(`${title}\n\n`)).toThrow('no description');
  });

  it('reads HTTPS and SSH GitHub remotes and refuses others', () => {
    expect(githubRepo('https://github.com/lanestrin/icorium.git')).toBe(repo);
    expect(githubRepo('https://github.com/lanestrin/icorium')).toBe(repo);
    expect(githubRepo('git@github.com:lanestrin/icorium.git')).toBe(repo);
    expect(() => githubRepo('https://gitlab.com/lanestrin/icorium.git')).toThrow('not a GitHub repository');
  });
});

describe('GitHub request', () => {
  const token = 'ghp_secretTokenValue123';

  it('sends the token only in the Authorization header to api.github.com', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    await githubRequest(token, fetchImpl)('POST', `/repos/${repo}/pulls`, { title });
    expect(seen[0].url).toBe(`https://api.github.com/repos/${repo}/pulls`);
    expect(seen[0].url).not.toContain(token);
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    expect(String(seen[0].init.body)).not.toContain(token);
  });

  it('keeps the token out of error messages, even when GitHub echoes it', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ message: `Bad credentials for ${token}` }), { status: 401 });
    const failure = githubRequest(token, fetchImpl)('GET', `/repos/${repo}/pulls`);
    await expect(failure).rejects.toThrow('failed with 401');
    await expect(failure).rejects.not.toThrow(token);
  });

  it('keeps every part of the token out of an error message cut at 400 characters', async () => {
    const path = `/repos/${repo}/pulls`;
    const prefix = `GitHub GET ${path} failed with 401: `;
    // Place the echoed token so that it crosses the 400th character of the message.
    const message = `${'x'.repeat(400 - prefix.length - 5)}${token} trailing text`;
    const fetchImpl = async () => new Response(JSON.stringify({ message }), { status: 401 });
    const error = await githubRequest(token, fetchImpl)('GET', path).catch((caught: Error) => caught);
    expect(error.message.length).toBeLessThanOrEqual(400);
    expect(error.message).not.toContain(token.slice(0, 5));
  });

  it('keeps the token out of network errors', async () => {
    const fetchImpl = async () => {
      throw new Error(`connect failed (Authorization: Bearer ${token})`);
    };
    const failure = githubRequest(token, fetchImpl)('GET', `/repos/${repo}/pulls`);
    await expect(failure).rejects.toThrow('could not be sent');
    await expect(failure).rejects.not.toThrow(token);
  });
});
