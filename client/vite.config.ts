import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // API_URL optionally overrides the local development API target.
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3001' } },
});
