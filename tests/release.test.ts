// Tests for the release zip (scripts/build-release.mjs, release/allowlist.txt) and the release workflow's shape. The scripts live outside the workspaces, so their tests sit here
// where `npm run verify` runs them. Zips are built from a throwaway Git repository and read back with a small
// zip reader, so the checks look at what would actually ship.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain JavaScript module without type declarations
import { buildManifest, buildRelease, forbiddenPaths, filesWithSecrets, releaseVersion, selectFiles } from '../scripts/build-release.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

/** Lists a zip's files (not folders) with their contents, from its central directory. */
function readZip(file: string) {
  const zip = readFileSync(file);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = zip.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    if (!name.endsWith('/')) entries.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const tempDirs: string[] = [];
afterAll(() => tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'release-test-'));
  tempDirs.push(dir);
  return dir;
}

const ALLOWLIST = ['# test allowlist', 'package.json', 'client/src/**', 'sample-data/**', '!**/*.test.ts', ''].join('\n');

/** A small repository tagged v1.2.3, with files that should and should not ship. */
function fixtureRepo(files: Record<string, string> = {}) {
  const dir = tempDir();
  const all: Record<string, string> = {
    'package.json': '{ "name": "icorium", "version": "1.2.3" }\n',
    'client/src/main.ts': 'export const answer = 42;\n',
    'client/src/main.test.ts': 'test code\n',
    'sample-data/a.csv': 'batch_id,mass\nA-001,10\n',
    'blueprint/plan.md': '# private plan\n',
    'scripts/tool.mjs': '// tooling\n',
    'release/allowlist.txt': ALLOWLIST,
    'release/DEPLOY.md': '# Deploy {{TAG}} ({{VERSION}}) from {{COMMIT}}\n',
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const env = { ...process.env, GIT_AUTHOR_DATE: '2026-01-02T03:04:05Z', GIT_COMMITTER_DATE: '2026-01-02T03:04:05Z' };
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'core.autocrlf=false', ...args], { cwd: dir, env, stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'fixture');
  git('tag', 'v1.2.3');
  writeFileSync(join(dir, 'client/src/untracked.ts'), 'not committed\n');
  return dir;
}

describe('release file selection', () => {
  const tracked = ['package.json', 'client/src/a.ts', 'client/src/a.test.ts', 'client/src/deep/b.tsx', 'sample-data/x.csv', 'blueprint/plan.md', 'README.md'];

  it('ships only allowlisted files, without test files, sorted', () => {
    expect(selectFiles(tracked, ALLOWLIST)).toEqual(['client/src/a.ts', 'client/src/deep/b.tsx', 'package.json', 'sample-data/x.csv']);
  });

  it('never ships a path that is not tracked, even when it matches', () => {
    expect(selectFiles(['package.json'], ALLOWLIST)).toEqual(['package.json']);
  });

  it.each(['blueprint/plan.md', '.github/workflows/ci.yml', '.claude/settings.json', '.agents/skills/x/SKILL.md', 'CLAUDE.md', 'client/AGENTS.md', 'scripts/open-pr.mjs', 'release/allowlist.txt', '.vscode/settings.json', 'server/.env.local', 'keys/server.pem'])(
    'refuses the forbidden path %s even when allowlisted',
    (path) => {
      expect(forbiddenPaths(selectFiles([path], '**'))).toEqual([path]);
    },
  );

  it('allows ordinary application paths', () => {
    expect(forbiddenPaths(['client/src/App.tsx', 'shared/types.ts', 'README.md', 'sample-data/a.csv'])).toEqual([]);
  });

  it('flags text that looks like a credential', () => {
    const token = `ghp_${'a1B2'.repeat(9)}`;
    expect(filesWithSecrets([
      { path: 'ok.ts', content: Buffer.from('const x = 1;') },
      { path: 'leak.ts', content: Buffer.from(`const t = "${token}";`) },
      { path: 'key.txt', content: Buffer.from('-----BEGIN RSA PRIVATE KEY-----') },
    ])).toEqual(['leak.ts', 'key.txt']);
  });

  it('accepts only vX.Y.Z tags', () => {
    expect(releaseVersion('v1.10.0')).toBe('1.10.0');
    for (const bad of ['1.1.0', 'v1.1', 'v1.1.0-rc1', 'release-1', '']) expect(() => releaseVersion(bad)).toThrow('v1.2.3');
  });

  it('builds a sorted manifest with sizes and hashes and no build time', () => {
    const manifest = buildManifest({
      version: '1.2.3', tag: 'v1.2.3', commit: 'c'.repeat(40), commitDate: '2026-01-02T03:04:05Z',
      files: [{ path: 'b.txt', content: Buffer.from('bb') }, { path: 'a.txt', content: Buffer.from('a') }],
    });
    expect(manifest).toEqual({
      schemaVersion: 1, name: 'icorium', version: '1.2.3', tag: 'v1.2.3', commit: 'c'.repeat(40), commitDate: '2026-01-02T03:04:05Z', node: '24',
      files: [{ path: 'a.txt', bytes: 1, sha256: sha256('a') }, { path: 'b.txt', bytes: 2, sha256: sha256('bb') }],
    });
  });
});

describe('release zip build', () => {
  it('zips exactly the selected files, the manifest and the deploy guide, the same way every time', () => {
    const repo = fixtureRepo();
    const first = buildRelease({ repoDir: repo, tag: 'v1.2.3', outDir: tempDir() });
    const second = buildRelease({ repoDir: repo, tag: 'v1.2.3', outDir: tempDir() });

    const entries = readZip(first.zip);
    expect([...entries.keys()].sort()).toEqual([
      'icorium-v1.2.3/DEPLOY.md',
      'icorium-v1.2.3/RELEASE-MANIFEST.json',
      'icorium-v1.2.3/client/src/main.ts',
      'icorium-v1.2.3/package.json',
      'icorium-v1.2.3/sample-data/a.csv',
    ]);
    const manifest = JSON.parse(entries.get('icorium-v1.2.3/RELEASE-MANIFEST.json')!.toString('utf8'));
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/);
    for (const file of manifest.files) expect(sha256(entries.get(`icorium-v1.2.3/${file.path}`)!), file.path).toBe(file.sha256);
    expect(entries.get('icorium-v1.2.3/DEPLOY.md')!.toString('utf8')).toBe(`# Deploy v1.2.3 (1.2.3) from ${manifest.commit}\n`);

    const zipHash = sha256(readFileSync(first.zip));
    expect(readFileSync(first.sha256, 'utf8')).toBe(`${zipHash}  icorium-v1.2.3.zip\n`);
    expect(JSON.parse(readFileSync(first.manifest, 'utf8'))).toEqual(manifest);
    expect(sha256(readFileSync(second.zip))).toBe(zipHash);
  });

  it('refuses a forbidden path that the allowlist at the tag selects', () => {
    const repo = fixtureRepo({ 'release/allowlist.txt': `${ALLOWLIST}blueprint/**\n` });
    expect(() => buildRelease({ repoDir: repo, tag: 'v1.2.3', outDir: tempDir() })).toThrow('forbidden paths selected: blueprint/plan.md');
  });

  it('refuses a file containing text that looks like a credential', () => {
    const repo = fixtureRepo({ 'client/src/config.ts': `export const key = "ghp_${'x9'.repeat(18)}";\n` });
    expect(() => buildRelease({ repoDir: repo, tag: 'v1.2.3', outDir: tempDir() })).toThrow('client/src/config.ts');
  });

  it('refuses a tag whose package.json version differs', () => {
    const repo = fixtureRepo({ 'package.json': '{ "name": "icorium", "version": "1.2.2" }\n' });
    expect(() => buildRelease({ repoDir: repo, tag: 'v1.2.3', outDir: tempDir() })).toThrow('says version 1.2.2, not 1.2.3');
  });

  it('refuses a tag that does not exist', () => {
    const repo = fixtureRepo();
    expect(() => buildRelease({ repoDir: repo, tag: 'v9.9.9', outDir: tempDir() })).toThrow('tag v9.9.9 does not exist');
  });
});

describe("this repository's allowlist", () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const selected: string[] = selectFiles(tracked, read('release/allowlist.txt'));

  it('ships what the app needs to install, build and run', () => {
    for (const path of ['package.json', 'package-lock.json', 'vercel.json', 'client/index.html', 'client/package.json', 'client/vite.config.ts', 'client/src/main.tsx', 'shared/types.ts', 'tests/package.json']) {
      expect(selected, path).toContain(path);
    }
    // Every workspace the root package names has its package.json in the zip, so npm ci can install it.
    for (const workspace of JSON.parse(read('package.json')).workspaces) expect(selected).toContain(`${workspace}/package.json`);
    // The test workspace ships only its manifest.
    expect(selected.filter((path) => path.startsWith('tests/'))).toEqual(['tests/package.json']);
    expect(selected.filter((path) => path.startsWith('sample-data/') && path.endsWith('.csv')).length).toBe(5);
  });

  it('ships no tests, planning, tooling or forbidden paths', () => {
    expect(forbiddenPaths(selected)).toEqual([]);
    expect(selected.filter((path) => /\.test\.tsx?$/.test(path) || path === 'client/src/test-setup.ts')).toEqual([]);
  });
});

describe('release artifact workflow', () => {
  const workflow = read('.github/workflows/release-artifact.yml').replace(/\r\n/g, '\n');
  const runLines = workflow.split('\n').filter((line) => !line.trim().startsWith('#'));

  it('runs on a published release and on a manual rebuild with a tag', () => {
    expect(workflow).toMatch(/\n  release:\n    types: \[published\]\n/);
    expect(workflow).toMatch(/\n  workflow_dispatch:\n    inputs:\n      tag:\n[\s\S]*?required: true/);
  });

  it('can only read the repository, except the attach job, which writes release assets', () => {
    expect(workflow).toMatch(/\npermissions:\n  contents: read\n/);
    const grants = [...workflow.matchAll(/^\s+(contents|actions|packages|pull-requests|id-token|deployments|issues|statuses|checks|pages): (write|read)/gm)].map((m) => `${m[1]}: ${m[2]}`);
    expect(grants.sort()).toEqual(['contents: read', 'contents: write']);
    expect(workflow.indexOf('contents: write')).toBeGreaterThan(workflow.indexOf('\n  attach:\n'));
  });

  it('builds, verifies and smoke-tests before attaching, in that order', () => {
    const order = ['npm run verify', 'node scripts/build-release.mjs', 'client/dist/architecture/index.html', 'actions/upload-artifact@', '\n  attach:\n    needs: build', 'actions/download-artifact@', 'gh release upload'];
    const positions = order.map((text) => workflow.indexOf(text));
    expect(positions.every((position) => position > 0), String(positions)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(workflow).toContain('--clobber');
  });

  it('passes the tag to scripts only through environment variables', () => {
    const inlineInRun = runLines.filter((line) => /\$\{\{\s*(github\.event\.release\.tag_name|inputs\.tag)/.test(line) && !/^\s+(TAG|group):/.test(line));
    expect(inlineInRun).toEqual([]);
  });

  it('smoke-tests the unzipped release as a static site: installs, builds, and checks its pages and samples', () => {
    const smoke = runLines.join('\n');
    for (const text of ['npm ci', 'npm run build -w client', 'client/dist/index.html', 'client/dist/generator/index.html', 'client/dist/architecture/index.html', "grep -rqF 'A-001' client/dist/assets"]) {
      expect(smoke, text).toContain(text);
    }
    expect(smoke).not.toMatch(/npm start|curl /);
  });

  it('never pushes, deploys or creates repositories', () => {
    for (const forbidden of ['git push', 'vercel', 'deploy', 'gh repo create', 'RELEASE_PLEASE_TOKEN']) {
      expect(runLines.join('\n').toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });
});
