// Builds the deployable release zip for one tag: icorium-vX.Y.Z.zip, its .sha256 and a manifest.
// Only files that are tracked at the tag AND listed in release/allowlist.txt (as it is at that tag) ship.
// Planning, tooling, workflow, script and secret paths are refused whatever the allowlist says, and so is any
// file whose text looks like a token. The zip is built by `git archive` from the tag, so building the same tag
// twice gives the same zip. Node standard library and git only.
//
// Usage, from the repository root:
//   node scripts/build-release.mjs <tag> <out-dir>
// Prints the three output paths, or exits 1 with the reason.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Paths that must never ship, even if the allowlist matches them. */
export const FORBIDDEN_PATHS = [
  'blueprint/**',
  '.github/**',
  '.claude/**',
  '.agents/**',
  '**/CLAUDE.md',
  '**/CLAUDE.local.md',
  '**/AGENTS.md',
  'scripts/**',
  'release/**',
  '.vscode/**',
  '**/.env*',
  '**/*.pem',
  '**/*.key',
];

/** Text that looks like a credential. A match anywhere in a shipped file stops the build. */
export const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9]{20,}/,
  /gho_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /vercel_blob_rw_[A-Za-z0-9_]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Turns a glob into a whole-path regular expression: * within a folder, ** across folders, ? one character. */
export function globToRegExp(glob) {
  let pattern = '';
  for (let i = 0; i < glob.length; ) {
    if (glob.startsWith('**/', i)) {
      pattern += '(?:.*/)?';
      i += 3;
    } else if (glob.startsWith('**', i)) {
      pattern += '.*';
      i += 2;
    } else if (glob[i] === '*') {
      pattern += '[^/]*';
      i += 1;
    } else if (glob[i] === '?') {
      pattern += '[^/]';
      i += 1;
    } else {
      pattern += glob[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}

/** Reads the allowlist: one glob per line, # comments, ! lines remove matches. */
export function parseAllowlist(text) {
  const include = [];
  const exclude = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('!')) exclude.push(globToRegExp(line.slice(1)));
    else include.push(globToRegExp(line));
  }
  return { include, exclude };
}

/** The tracked paths the allowlist selects, sorted. */
export function selectFiles(trackedPaths, allowlistText) {
  const { include, exclude } = parseAllowlist(allowlistText);
  return trackedPaths
    .filter((path) => include.some((re) => re.test(path)) && !exclude.some((re) => re.test(path)))
    .sort();
}

/** Selected paths that match a forbidden pattern. */
export function forbiddenPaths(paths) {
  const forbidden = FORBIDDEN_PATHS.map(globToRegExp);
  return paths.filter((path) => forbidden.some((re) => re.test(path)));
}

/** Files whose text looks like it contains a credential. */
export function filesWithSecrets(files) {
  return files.filter(({ content }) => {
    const text = content.toString('utf8');
    return SECRET_PATTERNS.some((re) => re.test(text));
  }).map(({ path }) => path);
}

/** "1.2.3" from "v1.2.3"; anything else is refused. */
export function releaseVersion(tag) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tag ?? '');
  if (!match) throw new Error(`the tag must look like v1.2.3, got "${tag}"`);
  return match[1];
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** The release manifest: no build time, files sorted by path, so the same tag always gives the same manifest. */
export function buildManifest({ version, tag, commit, commitDate, files }) {
  return {
    schemaVersion: 1,
    name: 'icorium',
    version,
    tag,
    commit,
    commitDate,
    node: '24',
    files: [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map(({ path, content }) => ({ path, bytes: content.length, sha256: sha256(content) })),
  };
}

/** Builds the zip, checksum and manifest for `tag` from the repository at `repoDir` into `outDir`. */
export function buildRelease({ repoDir, tag, outDir }) {
  const version = releaseVersion(tag);
  // Raw blobs, never working-tree conversions: line-ending settings must not change what ships.
  const git = (args, options = {}) =>
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...args], {
      cwd: repoDir,
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, GIT_LITERAL_PATHSPECS: '1' },
      ...options,
    });
  const text = (args) => git(args, { encoding: 'utf8' }).trim();

  let commit;
  try {
    commit = text(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]);
  } catch {
    throw new Error(`tag ${tag} does not exist`);
  }
  const packageVersion = JSON.parse(text(['show', `${commit}:package.json`])).version;
  if (packageVersion !== version) {
    throw new Error(`package.json at ${tag} says version ${packageVersion}, not ${version}`);
  }

  const tracked = git(['ls-tree', '-r', '-z', '--name-only', commit], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const selected = selectFiles(tracked, text(['show', `${commit}:release/allowlist.txt`]));
  if (selected.length === 0) throw new Error(`the allowlist selects no files at ${tag}`);
  const forbidden = forbiddenPaths(selected);
  if (forbidden.length) throw new Error(`forbidden paths selected: ${forbidden.join(', ')}`);
  const files = selected.map((path) => ({ path, content: git(['cat-file', 'blob', `${commit}:${path}`]) }));
  const secrets = filesWithSecrets(files);
  if (secrets.length) throw new Error(`text that looks like a credential in: ${secrets.join(', ')}`);

  const manifest = buildManifest({ version, tag, commit, commitDate: text(['show', '-s', '--format=%cI', commit]), files });
  const deploy = text(['show', `${commit}:release/DEPLOY.md`])
    .replaceAll('{{TAG}}', tag)
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{COMMIT}}', commit);

  const name = `icorium-v${version}`;
  mkdirSync(outDir, { recursive: true });
  const extras = mkdtempSync(join(tmpdir(), 'release-'));
  try {
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(join(extras, 'RELEASE-MANIFEST.json'), manifestText);
    writeFileSync(join(extras, 'DEPLOY.md'), `${deploy}\n`);
    const zipPath = resolve(outDir, `${name}.zip`);
    git([
      'archive',
      '--format=zip',
      `--prefix=${name}/`,
      `--add-file=${join(extras, 'RELEASE-MANIFEST.json')}`,
      `--add-file=${join(extras, 'DEPLOY.md')}`,
      '-o',
      zipPath,
      commit,
      '--',
      ...selected,
    ]);
    const shaPath = `${zipPath}.sha256`;
    writeFileSync(shaPath, `${sha256(readFileSync(zipPath))}  ${name}.zip\n`);
    const manifestPath = resolve(outDir, `${name}.manifest.json`);
    writeFileSync(manifestPath, manifestText);
    return { zip: zipPath, sha256: shaPath, manifest: manifestPath, files: selected };
  } finally {
    rmSync(extras, { recursive: true, force: true });
  }
}

// Run only when started as `node scripts/build-release.mjs`, not when a test imports it.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [tag, outDir] = process.argv.slice(2);
  try {
    if (!outDir) throw new Error('usage: node scripts/build-release.mjs <tag> <out-dir>');
    const repoDir = fileURLToPath(new URL('..', import.meta.url));
    const result = buildRelease({ repoDir, tag, outDir: resolve(outDir) });
    console.log(`${result.zip}\n${result.sha256}\n${result.manifest}`);
    console.error(`${result.files.length} files`);
  } catch (error) {
    console.error(`build-release: ${error.message}`);
    process.exit(1);
  }
}
