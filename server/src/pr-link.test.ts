// Tests for scripts/pr-link.mjs, which /approve uses to hand over a PR link with the reviewed title and
// description already filled in. The script lives in scripts/, which has no test runner, so its tests sit here
// where `npm run verify` runs them.
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript module without type declarations
import { MAX_URL_LENGTH, githubRepo, prLink, splitDraft } from '../../scripts/pr-link.mjs';

const remoteUrl = 'https://github.com/lanestrin/icorium.git';
const branch = 'chore/approve-link-prefills-description';
const title = 'chore: run GitHub Actions on Node 24 and guard override markers';
const body = [
  '## Summary',
  '',
  'Moves `checkout@v4` → `@v5` for PR #62 & #63, with "quotes", 50% and a trailing question?',
  '',
  '- one',
  '- two',
].join('\n');
const draft = `${title}\n\n${body}\n`;

function decoded(url: string) {
  const params = new URL(url).searchParams;
  return { quickPull: params.get('quick_pull'), title: params.get('title'), body: params.get('body') };
}

describe('PR link', () => {
  it('pre-fills the exact title and description', () => {
    const link = prLink({ remoteUrl, branch, draft });
    expect(link.bodyIncluded).toBe(true);
    expect(link.url.startsWith(`https://github.com/lanestrin/icorium/compare/main...${branch}?`)).toBe(true);
    expect(decoded(link.url)).toEqual({ quickPull: '1', title, body });
  });

  it('reads a Windows-style draft the same way', () => {
    const link = prLink({ remoteUrl, branch, draft: draft.replace(/\n/g, '\r\n') });
    expect(decoded(link.url)).toEqual({ quickPull: '1', title, body });
  });

  it('accepts HTTPS and SSH GitHub remotes', () => {
    expect(githubRepo('https://github.com/lanestrin/icorium.git')).toBe('lanestrin/icorium');
    expect(githubRepo('https://github.com/lanestrin/icorium')).toBe('lanestrin/icorium');
    expect(githubRepo('git@github.com:lanestrin/icorium.git')).toBe('lanestrin/icorium');
  });

  it('refuses a remote that is not on GitHub', () => {
    expect(() => githubRepo('https://gitlab.com/lanestrin/icorium.git')).toThrow('not a GitHub repository');
  });

  it('refuses to open a PR from main', () => {
    expect(() => prLink({ remoteUrl, branch: 'main', draft })).toThrow('work branch');
  });

  it.each(['BEGIN_COMMIT_OVERRIDE', 'END_COMMIT_OVERRIDE'])('refuses a description that mentions %s', (marker) => {
    expect(() => splitDraft(`${title}\n\nDocument the ${marker} recovery.`)).toThrow('commit-override block');
  });

  it('refuses a draft without a title or a description', () => {
    expect(() => splitDraft('\n\n## Summary')).toThrow('no title');
    expect(() => splitDraft(`${title}\n\n`)).toThrow('no description');
  });

  it('falls back to a title-only link when the description is too long', () => {
    const longBody = `## Summary\n\n${'word '.repeat(MAX_URL_LENGTH)}`;
    const link = prLink({ remoteUrl, branch, draft: `${title}\n\n${longBody}` });
    expect(link.bodyIncluded).toBe(false);
    expect(link.url.length).toBeLessThanOrEqual(MAX_URL_LENGTH);
    expect(decoded(link.url)).toEqual({ quickPull: '1', title, body: null });
    expect(link.body).toBe(longBody.trim());
  });
});
