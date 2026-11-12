// Keeps the Architecture & Tech Stack page honest: everything it names must exist in this repository.
// Files are read with Vite's import.meta.glob (raw text), so the client needs no Node type definitions.
import { describe, expect, it } from 'vitest';
import { COMPARE_MAX } from '../../shared/types';
import { FLOWS, NODES, TECH } from './components/ArchitecturePage';

const GLOBBED = import.meta.glob(
  ['../../client/src/**/*', '../../client/*.ts', '../../client/package.json', '../../server/src/**/*.ts', '../../server/package.json', '../../shared/*.ts', '../../blueprint/vercel-deployment.md'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** The same files keyed by repository path, e.g. "server/src/app.ts". */
const REPO = Object.fromEntries(Object.entries(GLOBBED).map(([key, text]) => [new URL(key, 'file:///repo/client/src/x').pathname.slice('/repo/'.length), text]));
const read = (file: string) => {
  expect(REPO, file).toHaveProperty([file]);
  return REPO[file];
};
/** A file, or a folder holding at least one file. */
const exists = (p: string) => p in REPO || Object.keys(REPO).some((f) => f.startsWith(`${p}/`));
const dependencies = (workspace: string) => {
  const pkg = JSON.parse(read(`${workspace}/package.json`));
  return { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
};

describe('Architecture page content', () => {
  it('only names repository paths that exist', () => {
    const paths = [...TECH.flatMap((t) => t.files), ...NODES.flatMap((n) => n.files)];
    expect(paths.length).toBeGreaterThan(20);
    for (const p of paths) expect(exists(p), p).toBe(true);
    expect(exists('client/src/no-such-file.tsx')).toBe(false);
  });

  it('only names packages the client or server actually depends on', () => {
    for (const t of TECH)
      for (const [workspace, name] of t.packages) expect(dependencies(workspace), `${t.name}: ${workspace} ${name}`).toHaveProperty([name]);
  });

  it('states the major versions in its card titles correctly', () => {
    const major = (workspace: string, name: string) => dependencies(workspace)[name].replace(/^[^\d]*/, '').split('.')[0];
    expect(major('client', 'react')).toBe('19');
    expect(major('client', 'tailwindcss')).toBe('4');
    expect(major('server', 'fastify')).toBe('5');
  });

  it('builds every request flow from components in the diagram', () => {
    const ids = new Set(NODES.map((n) => n.id));
    expect(ids.size).toBe(NODES.length);
    for (const f of FLOWS) for (const s of f.steps) expect(ids.has(s.node), `${f.id}: ${s.node}`).toBe(true);
  });

  it('quotes limits and rules that match the code', () => {
    expect(read('server/src/app.ts')).toContain('fileSize: 10 * 1024 * 1024'); // 10 MB uploads
    expect(read('server/src/app.ts')).toContain("level: 'warn'"); // warnings and errors only
    expect(read('server/src/processing/index.ts')).toContain('TOTAL_TOLERANCE_PCT = 0.5'); // ±0.5 points
    expect(read('shared/types.ts')).toMatch(/GENERATOR_MAX_ROWS = 5000;[\s\S]*GENERATOR_MAX_FILES = 10;/);
    expect(COMPARE_MAX).toBe(5);
    const storage = read('server/src/lib/storage.ts');
    expect(storage).toContain("'meta.json'");
    expect(storage).toContain('BLOB_READ_WRITE_TOKEN');
    expect(storage).toMatch(/env\.VERCEL && !useBlob/); // no Blob token on Vercel: refuse to start
    expect(storage).toContain('rename('); // meta.json is replaced atomically
    // The page describes the Vercel setup as configured but not deployed, as the deployment notes record.
    expect(read('blueprint/vercel-deployment.md')).toContain('No project, store or deployment has been');
  });
});
