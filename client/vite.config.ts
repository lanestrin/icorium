import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { pageCopies } from './src/lib/pages';
import { environmentLabel } from './src/lib/app-version';
import rootPackage from '../package.json';

export default defineConfig({
  // The version label in each page's navigation. APP_ENV_LABEL, when set, names the environment (Vercel's
  // Production environment sets it to Test). VERCEL_ENV and VERCEL_GIT_COMMIT_REF are Vercel's build-time
  // variables; locally all are unset, so the label shows the version alone.
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(rootPackage.version),
    'import.meta.env.VITE_APP_ENV': JSON.stringify(
      environmentLabel({ vercelEnv: process.env.VERCEL_ENV, branch: process.env.VERCEL_GIT_COMMIT_REF, label: process.env.APP_ENV_LABEL }),
    ),
  },
  // pageCopies writes dist/generator/index.html and dist/architecture/index.html so static hosts serve those pages.
  plugins: [react(), tailwindcss(), pageCopies()],
  // API_URL optionally overrides the local development API target.
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3001' } },
});
