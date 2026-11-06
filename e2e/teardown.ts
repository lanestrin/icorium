import fs from 'node:fs';

/** Deletes the throwaway data folder created in playwright.config.ts. */
export default function teardown() {
  const dir = process.env.RECLAIM_DATA_DIR;
  if (dir?.includes('reclaim-e2e-')) fs.rmSync(dir, { recursive: true, force: true });
}
