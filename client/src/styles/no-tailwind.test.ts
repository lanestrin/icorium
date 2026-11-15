// Keeps Tailwind out now that the client styles itself with SCSS Modules on the design tokens (build-plan
// 13.7). Files are read as raw text with Vite's import.meta.glob, like architecture-content.test.ts;
// vitest.config.ts lets stylesheets through so their text is readable.
import { describe, expect, it } from 'vitest';

/** Glob results keyed by repository path, e.g. "client/src/styles/reset.css". */
const byRepoPath = (files: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(files).map(([key, text]) => [new URL(key, 'file:///repo/client/src/styles/x').pathname.slice('/repo/'.length), text as string]));

const STYLESHEETS = byRepoPath(import.meta.glob('../**/*.{css,scss}', { query: '?raw', import: 'default', eager: true }));
const COMPONENTS = byRepoPath(import.meta.glob(['../**/*.tsx', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }));
const CONFIG = byRepoPath(import.meta.glob(['../../package.json', '../../../package.json', '../../vite.config.ts'], { query: '?raw', import: 'default', eager: true }));

/** The one plain class name allowed in markup: menu-select.css styles the native filter and Sort by selects. */
const ALLOWED_CLASSES = new Set(['menu-select']);

type Hit = { line: number; text: string };

/** The 1-based line that a character offset falls on. */
const lineAt = (source: string, index: number) => source.slice(0, index).split('\n').length;

/** True when a class string is anything other than allowed plain names (a template with ${} never is). */
const isDisallowed = (classes: string) => classes.includes('${') || classes.split(/\s+/).filter(Boolean).some((name) => !ALLOWED_CLASSES.has(name));

/**
 * Class names written as strings in a component's source: className="…" or '…', a quoted string or
 * template literal directly inside className={…}, and string arguments to classNames(…).
 */
function stringClassNames(source: string): Hit[] {
  const hits: Hit[] = [];
  const check = (index: number, classes: string, text: string) => {
    if (isDisallowed(classes)) hits.push({ line: lineAt(source, index), text });
  };
  for (const m of source.matchAll(/className=(["'])(.*?)\1/g)) check(m.index, m[2], m[0]);
  for (const m of source.matchAll(/className=\{\s*(["'`])(.*?)\1/g)) check(m.index, m[2], m[0]);
  for (const call of source.matchAll(/classNames\(([^)]*)\)/g)) {
    for (const arg of call[1].matchAll(/(["'`])(.*?)\1/g)) check(call.index, arg[2], call[0]);
  }
  return hits;
}

/** Lines of a stylesheet that bring Tailwind back. */
function tailwindInStylesheet(source: string, path: string): Hit[] {
  // reset.css keeps the MIT notice of the Tailwind file it was adapted from, as the licence requires,
  // so only the at-rules are checked there.
  const checkWord = path !== 'client/src/styles/reset.css';
  return source.split('\n').flatMap((text, i) =>
    /@apply\b|@reference\b|@tailwind\b/.test(text) || (checkWord && /tailwind/i.test(text)) ? [{ line: i + 1, text: text.trim() }] : [],
  );
}

const report = (files: Record<string, string>, find: (source: string, path: string) => Hit[]) =>
  Object.entries(files).flatMap(([path, source]) => find(source, path).map((hit) => `${path}:${hit.line} ${hit.text}`));

describe('no Tailwind', () => {
  it('finds the stylesheets and components it checks', () => {
    expect(Object.keys(STYLESHEETS)).toEqual(expect.arrayContaining(['client/src/styles/tokens.css', 'client/src/styles/reset.css', 'client/src/components/files/files.module.scss']));
    expect(Object.keys(COMPONENTS)).toContain('client/src/pages/FilesPage.tsx');
    expect(Object.keys(COMPONENTS).some((p) => p.endsWith('.test.tsx'))).toBe(false);
    expect(Object.keys(CONFIG).sort()).toEqual(['client/package.json', 'client/vite.config.ts', 'package.json']);
  });

  it('has no @apply, @reference, @tailwind or Tailwind import in any stylesheet', () => {
    expect(report(STYLESHEETS, tailwindInStylesheet)).toEqual([]);
  });

  it('writes no class name as a string in any component, except menu-select', () => {
    expect(report(COMPONENTS, stringClassNames)).toEqual([]);
  });

  it('depends on no Tailwind package and configures no Tailwind plugin', () => {
    for (const [path, text] of Object.entries(CONFIG)) {
      if (path.endsWith('package.json')) {
        const pkg = JSON.parse(text);
        const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        expect(names.filter((name) => name === 'tailwindcss' || name.startsWith('@tailwindcss/')), path).toEqual([]);
      } else {
        expect(text, path).not.toMatch(/tailwind/i);
      }
    }
  });

  describe('the class-name detector', () => {
    it.each([
      ['<div className="mt-4">', 'a className string'],
      ["<div className='mt-4'>", 'a single-quoted className string'],
      ["<div className={classNames('flex', styles.x)}>", 'a string inside classNames'],
      ['<div className={`a ${b}`}>', 'a template literal'],
      ["<select className={classNames('menu-select mt-4', styles.x)}>", 'an allowed name with a utility'],
    ])('flags %s (%s)', (source) => {
      expect(stringClassNames(source)).toHaveLength(1);
    });

    it.each([
      ['<div className={styles.x}>'],
      ["<select className={classNames('menu-select', styles.x)}>"],
      ['<div className={classNames(styles.a, isOn && styles.b)}>'],
    ])('allows %s', (source) => {
      expect(stringClassNames(source)).toEqual([]);
    });

    it('reports the line of a hit', () => {
      expect(stringClassNames('const a = 1;\n\n<p className="text-sm">')).toEqual([{ line: 3, text: 'className="text-sm"' }]);
    });
  });

  describe('the stylesheet check', () => {
    it('flags @apply and the word Tailwind, and allows the reset licence notice', () => {
      expect(tailwindInStylesheet('.a {\n  @apply p-4;\n}', 'x.module.scss')).toEqual([{ line: 2, text: '@apply p-4;' }]);
      expect(tailwindInStylesheet('// Tailwind spacing', 'x.module.scss')).toHaveLength(1);
      expect(tailwindInStylesheet(' * Copyright (c) Tailwind Labs, Inc.', 'client/src/styles/reset.css')).toEqual([]);
      expect(tailwindInStylesheet('@tailwind base;', 'client/src/styles/reset.css')).toHaveLength(1);
    });
  });
});
