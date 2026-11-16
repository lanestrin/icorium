// Keeps every colour in tokens.css (build-plan 14.3): stylesheets and client source, stories included,
// use var(--app-…) instead of a hex, rgb() or hsl() literal. Files are read as raw text with Vite's
// import.meta.glob, like no-tailwind.test.ts; tests are skipped so their fixtures can use any value.
import { describe, expect, it } from 'vitest';

/** Glob results keyed by repository path, e.g. "client/src/styles/menu-select.css". */
const byRepoPath = (files: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(files).map(([key, text]) => [new URL(key, 'file:///repo/client/src/styles/x').pathname.slice('/repo/'.length), text as string]));

const TOKENS_FILE = 'client/src/styles/tokens.css';
const STYLESHEETS = byRepoPath(import.meta.glob('../**/*.{css,scss}', { query: '?raw', import: 'default', eager: true }));
const SOURCE = byRepoPath(import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }));

/** A hex colour (#rgb, #rgba, #rrggbb, #rrggbbaa) or an rgb()/rgba()/hsl()/hsla() call. */
const RAW_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/i;

type Hit = { line: number; text: string };

/** Lines of a file that write a colour literally. */
function rawColors(source: string): Hit[] {
  return source.split('\n').flatMap((text, i) => (RAW_COLOR.test(text) ? [{ line: i + 1, text: text.trim() }] : []));
}

const report = (files: Record<string, string>) =>
  Object.entries(files)
    .filter(([path]) => path !== TOKENS_FILE)
    .flatMap(([path, source]) => rawColors(source).map((hit) => `${path}:${hit.line} ${hit.text}`));

describe('no raw colours outside tokens.css', () => {
  it('finds the files it checks', () => {
    expect(Object.keys(STYLESHEETS)).toEqual(expect.arrayContaining([TOKENS_FILE, 'client/src/styles/menu-select.css']));
    expect(Object.keys(SOURCE)).toEqual(expect.arrayContaining(['client/src/components/compare/RowChart.tsx', 'client/src/components/ui/Card.stories.tsx']));
    expect(Object.keys(SOURCE).some((p) => /\.test\.tsx?$/.test(p))).toBe(false);
  });

  it('has no colour literal in any stylesheet except tokens.css', () => {
    expect(report(STYLESHEETS)).toEqual([]);
  });

  it('has no colour literal in any component, story or module', () => {
    expect(report(SOURCE)).toEqual([]);
  });

  describe('the detector', () => {
    it.each([
      ["stroke=\"#e2e8f0\""],
      ["background: #fff;"],
      ["color: #1d4ed8cc;"],
      ["border: 1px solid #ABCD;"],
      ["box-shadow: 0 1px 2px rgb(15 23 42 / 0.15);"],
      ["color: rgba(0, 0, 0, 0.5);"],
      ["fill: hsl(210 40% 50%);"],
      ["fill: hsla(210, 40%, 50%, 1);"],
    ])('flags %s', (source) => {
      expect(rawColors(source)).toHaveLength(1);
    });

    it.each([
      ["stroke=\"var(--app-color-chart-grid)\""],
      ["{ key: '#1', label: '#1' }"],
      ["<a href=\"#main\">"],
      ["// See issue #12"],
      ["color: color-mix(in oklab, var(--app-color-white) 80%, transparent);"],
    ])('allows %s', (source) => {
      expect(rawColors(source)).toEqual([]);
    });

    it('reports the line of a hit', () => {
      expect(rawColors('.a {\n  color: var(--x);\n  border-color: #cbd5e1;\n}')).toEqual([{ line: 3, text: 'border-color: #cbd5e1;' }]);
    });
  });
});
