import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pageCopies } from './src/lib/pages';

export default defineConfig({
  // pageCopies writes dist/generator/index.html and dist/architecture/index.html so static hosts serve those pages.
  plugins: [react(), tailwindcss(), pageCopies()],
  // API_URL optionally overrides the local development API target.
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3001' } },
});
