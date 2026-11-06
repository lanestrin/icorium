import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // API_URL lets the browser tests point at their own API instance.
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3001' } },
});
