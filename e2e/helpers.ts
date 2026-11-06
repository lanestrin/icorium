import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { FileMeta, ProcessorId } from '../shared/types';

export const sampleText = (name: string) => fs.readFileSync(path.join(__dirname, '..', 'sample-data', name), 'utf8');

/** A file name no earlier test or run has used, e.g. "saved_b_1730851234567". No extension. */
let counter = 0;
export const uniqueName = (base: string) => `${base}_${Date.now()}${counter++}`;

/** A valid Partner A CSV with `n` rows, batch IDs X-1 … X-n. */
export const bigCsv = (n: number) =>
  ['batch_id,sample_date,feed_mass_kg,r32_pct,r125_pct,r134a_pct', ...Array.from({ length: n }, (_, i) => `X-${i + 1},2026-09-01,100,40,30,30`)].join('\n');

/** The table row whose file-name cell is exactly `name`. */
export const fileRow = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });

export const fileA = (page: Page) => page.getByRole('combobox', { name: /^File A/ });
export const fileB = (page: Page) => page.getByRole('combobox', { name: /^File B/ });

/** Uploads through the real "browse files" file chooser. */
export async function uploadViaChooser(page: Page, files: { name: string; text: string }[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'browse files' }).click();
  await (await chooser).setFiles(files.map((f) => ({ name: f.name, mimeType: 'text/csv', buffer: Buffer.from(f.text) })));
}

/** Checks the given input files, picks a function and clicks Run Processing. */
export async function runProcessing(page: Page, names: string[], fn: RegExp) {
  for (const name of names) await page.getByRole('checkbox', { name: `Select ${name}` }).check();
  await page.getByRole('radio', { name: fn }).check();
  await page.getByRole('button', { name: /Run Processing/ }).click();
}

/** Sets up a result through the API, for tests whose subject is something else. */
export async function processViaApi(page: Page, name: string, processor: ProcessorId): Promise<FileMeta> {
  const files: FileMeta[] = await (await page.request.get('/api/files')).json();
  const source = files.find((f) => f.name === name);
  expect(source, `sample ${name}`).toBeTruthy();
  const res = await page.request.post('/api/process', { data: { fileId: source!.id, processor } });
  expect(res.ok()).toBe(true);
  return res.json();
}
