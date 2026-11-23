// Keeps the Architecture & Tech Stack page honest: everything it names must exist in this repository.
// Files are read with Vite's import.meta.glob (raw text), so the client needs no Node type definitions.
import { describe, expect, it } from 'vitest';
import { COMPARE_MAX } from '../../../shared/types';
import { CONVERSION, CUSTOMER_SECURITY, HOSTED_DESIGN, ROADMAP, SCALE, TECH } from '../components/architecture/content';

const GLOBBED = import.meta.glob(
  ['../../../client/src/**/*', '../../../client/*.ts', '../../../client/.storybook/*.ts', '../../../client/package.json', '../../../tests/*.ts', '../../../tests/package.json', '../../../shared/*.ts', '../../../vercel.json', '../../../supabase/**/*.sql', '../../../blueprint/build-plan.md'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** The same files keyed by repository path, e.g. "shared/types.ts". */
const REPO = Object.fromEntries(Object.entries(GLOBBED).map(([key, text]) => [new URL(key, 'file:///repo/client/src/pages/x').pathname.slice('/repo/'.length), text]));
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
  it('separates shipped conversion from recommended services', () => {
    expect(CONVERSION.status).toBe('In use');
    expect(CONVERSION.recommendation).toBe('Recommended, not built');
    expect(CUSTOMER_SECURITY.status).toBe('Recommended, not built');
    expect(SCALE.status).toBe('Recommended, not built');
    expect(TECH.find((tech) => tech.name === 'Tesseract.js')?.packages).toContainEqual(['client', 'tesseract.js']);
    const installed = TECH.flatMap((tech) => tech.packages.map(([, name]) => name));
    for (const recommendation of ['fastify', 'pg', '@sentry/react']) expect(installed).not.toContain(recommendation);
  });

  it('matches the roadmap to the build plan: every M19, M17 and M18 item, Done only when checked, Next the first unchecked', () => {
    // Top-level plan items such as "- [x] **17.1** ..." (lettered sub-items like 17.2a are left out).
    const planItems = [...read('blueprint/build-plan.md').matchAll(/^\s*- \[( |x)\] \*\*(1[789]\.\d+)\*\*/gm)]
      .map(([, mark, id]) => ({ id, done: mark === 'x' }));
    const roadmapItems = ROADMAP.flatMap((milestone) => milestone.items);
    expect(roadmapItems.map((item) => item.id)).toEqual(planItems.map((item) => item.id));
    for (const [i, item] of roadmapItems.entries()) expect(item.status === 'Done', item.id).toBe(planItems[i].done);
    const firstUnchecked = planItems.find((item) => !item.done);
    expect(roadmapItems.filter((item) => item.status === 'Next').map((item) => item.id)).toEqual(firstUnchecked ? [firstUnchecked.id] : []);
    expect(HOSTED_DESIGN.status).toBe('Planned, not provisioned');
  });

  it('only names repository paths that exist', () => {
    const paths = TECH.flatMap((t) => t.files);
    expect(paths.length).toBeGreaterThan(10);
    for (const p of paths) expect(exists(p), p).toBe(true);
    expect(exists('supabase/migrations/20261118000000_identity.sql')).toBe(true); // named in the Roadmap section
    expect(exists('client/src/no-such-file.tsx')).toBe(false);
  });

  it('only names packages the client or the tests workspace actually depends on', () => {
    for (const t of TECH)
      for (const [workspace, name] of t.packages) expect(dependencies(workspace), `${t.name}: ${workspace} ${name}`).toHaveProperty([name]);
  });

  it('states the major versions in its card titles correctly', () => {
    const major = (workspace: string, name: string) => dependencies(workspace)[name].replace(/^[^\d]*/, '').split('.')[0];
    expect(major('client', 'react')).toBe('19');
    expect(major('client', 'storybook')).toBe('10');
  });

  it('quotes limits and rules that match the code', () => {
    expect(read('client/src/lib/api.ts')).toContain('UPLOAD_MAX_MB = 10;'); // 10 MB uploads
    expect(read('shared/storage.ts')).toMatch(/interface Storage \{[\s\S]*createAt\(id: string/); // the storage operations named
    expect(read('client/src/lib/browser-storage.ts')).toContain('indexedDB.open('); // files are kept in IndexedDB
    expect(read('client/src/lib/cloud-storage.ts')).toContain("BUCKET = 'workspace-files'"); // signed-in accounts keep files in the private bucket
    expect(read('supabase/migrations/20261123000000_cloud_files.sql')).toContain('workspace-files'); // the same bucket the SQL creates
    expect(read('shared/types.ts')).toContain('export const ADAPTERS = ['); // partner formats live in the shared file
    expect(read('shared/file-service.ts')).toContain('z.enum(PROCESSORS.map('); // allowed functions come from the shared list
    expect(read('shared/processing.ts')).toContain('TOTAL_TOLERANCE_PCT = 0.5'); // ±0.5 points
    expect(read('shared/types.ts')).toMatch(/GENERATOR_MAX_ROWS = 5000;[\s\S]*GENERATOR_MAX_FILES = 10;/);
    expect(COMPARE_MAX).toBe(5);
    // The page describes Vercel as serving one static site, with no server service.
    const vercel = JSON.parse(read('vercel.json'));
    expect(vercel).toMatchObject({ buildCommand: 'npm run build -w client', outputDirectory: 'client/dist' });
    expect(vercel).not.toHaveProperty('services');
    expect(vercel).not.toHaveProperty('rewrites');
  });
});
