// Tests for scripts/check-pr-title.ps1, the "PR title" check. With squash merge the PR title becomes the commit
// subject on main, and release-please reads that subject to pick the next version. The script lives in scripts/,
// which has no test runner, so its tests sit here where `npm run verify` runs them.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/check-pr-title.ps1', import.meta.url));
const releaseConfig = fileURLToPath(new URL('../../release-please-config.json', import.meta.url));

// CI (Ubuntu) has PowerShell 7 as `pwsh`; a Windows machine without it has Windows PowerShell.
function powershell(): string {
  try {
    execFileSync('pwsh', ['-NoProfile', '-Command', 'exit 0'], { stdio: 'ignore' });
    return 'pwsh';
  } catch {
    return 'powershell';
  }
}
const shell = powershell();

function checkTitle(title: string) {
  const run = spawnSync(shell, ['-NoProfile', '-File', script, '-Title', title], { encoding: 'utf8' });
  return { passed: run.status === 0, output: run.stdout };
}

describe('PR title check', () => {
  it.each([
    'feat: add automated releases and a version label (12.1)',
    'fix: serve the generator and architecture pages on static hosts',
    'feat!: identify files by File ID instead of by name (11.1)',
    'fix!: reject uploads without a batch ID column',
    'chore: allow the Release workflow to be started manually',
    'docs: plan File IDs as milestone M11',
    'test: add file identity regression for same-named files (11.6)',
  ])('accepts %s', (title) => {
    expect(checkTitle(title)).toMatchObject({ passed: true });
  });

  it.each([
    ['a branch-name title', 'Feature/12.1 automated releases'],
    ['an unknown type', 'perf: parse each stored file once'],
    ['a scope', 'feat(ui): add a version label'],
    ['no space after the colon', 'feat:add a version label'],
    ['no summary', 'feat: '],
    ['an upper-case type', 'Feat: add a version label'],
    ['a trailing full stop', 'fix: serve the generator page.'],
    ['73 characters', `feat: ${'a'.repeat(67)}`],
  ])('rejects %s', (_case, title) => {
    const result = checkTitle(title);
    expect(result.passed).toBe(false);
    expect(result.output).toContain('PR title fails');
  });

  it('accepts exactly 72 characters', () => {
    expect(checkTitle(`feat: ${'a'.repeat(66)}`)).toMatchObject({ passed: true });
  });

  it('only accepts types that release-please either releases or deliberately hides', () => {
    const config = JSON.parse(readFileSync(releaseConfig, 'utf8')) as {
      'changelog-sections': { type: string; hidden?: boolean }[];
    };
    const shown = config['changelog-sections'].filter((section) => !section.hidden).map((section) => section.type);
    const hidden = config['changelog-sections'].filter((section) => section.hidden).map((section) => section.type);
    expect(shown.sort()).toEqual(['feat', 'fix']);
    expect(hidden.sort()).toEqual(['chore', 'docs', 'test']);
  });
});
