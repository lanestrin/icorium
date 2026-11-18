// Keeps the Architecture & Tech Stack page honest: everything it names must exist in this repository.
// Files are read with Vite's import.meta.glob (raw text), so the client needs no Node type definitions.
import { describe, expect, it } from 'vitest';
import { COMPARE_MAX } from '../../../shared/types';
import { CONVERSION, CUSTOMER_SECURITY, SCALE, TECH } from '../components/architecture/content';

const GLOBBED = import.meta.glob(
  ['../../../client/src/**/*', '../../../client/*.ts', '../../../client/.storybook/*.ts', '../../../client/package.json', '../../../tests/*.ts', '../../../tests/package.json', '../../../shared/*.ts', '../../../vercel.json'],
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

  it('only names repository paths that exist', () => {
    const paths = TECH.flatMap((t) => t.files);
    expect(paths.length).toBeGreaterThan(10);
    for (const p of paths) expect(exists(p), p).toBe(true);
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
