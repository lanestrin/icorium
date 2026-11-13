import { describe, expect, it, vi } from 'vitest';
import { PAGES, pageCopies } from './pages';

// Calls the plugin's generateBundle hook with a fake bundle and records what it emits.
function emitted(bundle: Record<string, unknown>) {
  const emitFile = vi.fn();
  const hook = pageCopies().generateBundle as (this: unknown, options: unknown, bundle: unknown) => void;
  hook.call({ emitFile }, {}, bundle);
  return emitFile.mock.calls.map(([file]) => file);
}

describe('page copies', () => {
  it('lists the generator and architecture pages', () => {
    expect(Object.values(PAGES)).toEqual(['/generator', '/architecture']);
  });

  it('copies the built index.html into a folder for every page', () => {
    const source = '<!doctype html><script type="module" src="/assets/index-abc.js"></script>';
    expect(emitted({ 'index.html': { type: 'asset', source } })).toEqual([
      { type: 'asset', fileName: 'generator/index.html', source },
      { type: 'asset', fileName: 'architecture/index.html', source },
    ]);
  });

  it('emits nothing when the bundle has no index.html', () => {
    expect(emitted({ 'assets/index-abc.js': { type: 'chunk' } })).toEqual([]);
  });

  it('only runs in production builds', () => {
    expect(pageCopies()).toMatchObject({ apply: 'build', enforce: 'post' });
  });
});
