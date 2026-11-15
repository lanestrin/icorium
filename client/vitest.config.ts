import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Vitest blanks CSS by default, even `?raw` imports. tokens.test.ts and no-tailwind.test.ts read the
    // app's own stylesheets as text, so every stylesheet under src/ is processed.
    css: { include: [/src[\\/].+\.s?css/] },
  },
});
