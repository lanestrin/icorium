import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
// Types only (removed at runtime): teaches TypeScript the jest-dom matchers such as toBeInTheDocument.
import type {} from '@testing-library/jest-dom/vitest';

// Register the jest-dom matchers here, not with a plain `import '@testing-library/jest-dom/vitest'`.
// That module is cached across test files, so only the first file in a worker would get the matchers.
expect.extend(matchers);
afterEach(cleanup);

// jsdom has no media-query engine; use the desktop branch for App interactions.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (media: string) => ({
    matches: true, media, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }),
});
