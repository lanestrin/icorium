import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Vitest blanks CSS by default, even `?raw` imports. tokens.test.ts reads these two stylesheets as text.
    css: { include: [/styles[\\/]tokens\.css/, /tailwindcss[\\/]theme\.css/] },
  },
});
