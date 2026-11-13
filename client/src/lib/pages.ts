import type { Plugin } from 'vite';

/** The app's pages besides the file workspace at "/". App.tsx picks them from the URL. */
export const PAGES = { generator: '/generator', architecture: '/architecture' } as const;

/**
 * A Vite build plugin that writes a copy of the built index.html for every page, for example
 * dist/generator/index.html. A static host such as Vercel then serves the app at /generator
 * instead of a 404; the dev server already answers every path with index.html.
 */
export function pageCopies(): Plugin {
  return {
    name: 'reclaim:page-copies',
    apply: 'build',
    enforce: 'post', // after Vite has added the built index.html to the bundle
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (html?.type !== 'asset') return;
      for (const path of Object.values(PAGES))
        this.emitFile({ type: 'asset', fileName: `${path.slice(1)}/index.html`, source: html.source });
    },
  };
}
