// The final acceptance checklist (blueprint/build-plan.md, section 9), driven through the real UI.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import Papa from 'papaparse';
import { fileA, fileB, fileRow, processViaApi, runProcessing, sampleText, uniqueName, uploadViaChooser } from './helpers';

const parse = (text: string) => Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(fileRow(page, 'partner_a_baseline.csv')).toBeVisible();
});

test('loads a CSV through the file chooser and shows its rows', async ({ page }) => {
  const name = `${uniqueName('upload_partner_a')}.csv`;
  await uploadViaChooser(page, [{ name, text: sampleText('partner_a_baseline.csv') }]);
  const row = fileRow(page, name);
  await expect(row).toContainText('Ready');

  await row.getByRole('button', { name: 'Preview' }).click();
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toContainText('25 rows · 6 columns');
  await expect(dialog.getByRole('columnheader', { name: 'feed_mass_kg' })).toBeVisible();
  await expect(dialog.getByRole('row')).toHaveCount(26); // header + 25 data rows
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('runs the chosen function on all rows, shows the results and exports original + generated columns', async ({ page }) => {
  const name = 'result_partner_b_baseline_mass.csv';
  await runProcessing(page, ['partner_b_baseline.csv'], /Component Mass Calculation/);

  // Results are shown in the app straight away
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  for (const col of ['lot_number', 'weight_lb', 'r32_mass_kg', 'mass_status'])
    await expect(dialog.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
  await expect(dialog.getByRole('row')).toHaveCount(26);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(fileRow(page, name)).toContainText('Processed');

  // The downloaded CSV keeps every original column and value, and appends the new ones
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: `Download ${name}` }).click();
  const exported = parse(fs.readFileSync(await (await download).path(), 'utf8'));
  const source = parse(sampleText('partner_b_baseline.csv'));
  expect(exported.meta.fields).toEqual([...source.meta.fields!, 'r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'mass_status']);
  expect(exported.data).toHaveLength(source.data.length);
  exported.data.forEach((row, i) => source.meta.fields!.forEach((h) => expect(row[h]).toBe(source.data[i][h])));
  expect(Number(exported.data[0].r32_mass_kg)).toBeGreaterThan(0);
  expect(exported.data[4].mass_status).toBe('Skipped (invalid input)'); // planted non-numeric weight
});

test('processes two files in one batch and compares the results in a chart', async ({ page }) => {
  await runProcessing(page, ['partner_a_baseline.csv', 'partner_a_followup.csv'], /Component Mass Calculation/);
  await expect(page.getByRole('status')).toContainText('Processed 2 files');
  await expect(fileA(page).locator('option:checked')).toHaveText('partner_a_baseline · Mass');
  await expect(fileB(page).locator('option:checked')).toHaveText('partner_a_followup · Mass');

  await page.getByRole('button', { name: 'Compare Selected' }).click();
  const dialog = page.getByRole('dialog', { name: /^result_partner_a_baseline_mass\.csv\s+vs\s+result_partner_a_followup_mass\.csv$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.recharts-bar-rectangle').first()).toBeVisible();

  const r32 = dialog.getByRole('row').filter({ has: page.getByRole('cell', { name: 'r32_mass_kg', exact: true }) });
  await expect(r32).toContainText('Total across rows (kg)');
  await expect(r32.getByRole('cell').last()).toHaveText(/^[1-9]\d* \/ 25$/); // a genuine difference
});

test('compares two result CSVs loaded from disk, even after renaming them', async ({ page }) => {
  const saved: string[] = [];
  for (const name of ['partner_b_baseline.csv', 'partner_b_followup.csv']) {
    const result = await processViaApi(page, name, 'validation');
    saved.push(await (await page.request.get(`/api/files/${result.id}/download`)).text());
  }
  await page.reload();

  const [a, b] = [uniqueName('saved_b_baseline'), uniqueName('saved_b_followup')];
  await uploadViaChooser(page, [
    { name: `${a}.csv`, text: saved[0] },
    { name: `${b}.csv`, text: saved[1] },
  ]);
  await expect(fileRow(page, `${a}.csv`)).toContainText('Processed');
  await expect(fileRow(page, `${b}.csv`)).toContainText('Processed');

  await fileA(page).selectOption({ label: `${a} · Validation` });
  await fileB(page).selectOption({ label: `${b} · Validation` });
  await page.getByRole('button', { name: 'Compare Selected' }).click();
  const dialog = page.getByRole('dialog', { name: new RegExp(`^${a}\\.csv\\s+vs\\s+${b}\\.csv$`) });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.recharts-bar-rectangle').first()).toBeVisible();
});

test('shows which file has problem rows: in the list, the preview and the comparison', async ({ page }) => {
  await processViaApi(page, 'partner_a_baseline.csv', 'validation');
  await processViaApi(page, 'partner_c_baseline.csv', 'validation');
  await page.reload();

  // List: a tag on each file with problems
  await expect(fileRow(page, 'result_partner_a_baseline_validation.csv')).toContainText('1 row flagged');
  await expect(fileRow(page, 'partner_b_followup.csv')).toContainText('2 rows flagged');

  // Preview: which rows, and why
  await fileRow(page, 'result_partner_a_baseline_validation.csv').getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('dialog', { name: 'result_partner_a_baseline_validation.csv' });
  await expect(preview.getByRole('region', { name: 'Rows with problems' })).toContainText(/Row 8 · A-\d+: mass missing/);
  await expect(preview.getByRole('row').nth(8)).toHaveAttribute('title', 'mass missing'); // row 8 is marked in the table
  await page.keyboard.press('Escape');

  // Comparison: each file's problems, labelled A or B
  await fileA(page).selectOption({ label: 'partner_a_baseline · Validation' });
  await fileB(page).selectOption({ label: 'partner_c_baseline · Validation' });
  await page.getByRole('button', { name: 'Compare Selected' }).click();
  const compare = page.getByRole('dialog', { name: /vs/ });
  const a = compare.getByRole('region', { name: 'Problems in A · result_partner_a_baseline_validation.csv' });
  const b = compare.getByRole('region', { name: 'Problems in B · result_partner_c_baseline_validation.csv' });
  await expect(a).toContainText('1 row flagged');
  await expect(a).toContainText(/Row 8 · .*mass missing/);
  await expect(b).toContainText(/Row 18 · .*composition totals 78\.37%/);
  await expect(a).not.toContainText('composition totals');
});

test('shows a clear error for a CSV it cannot read', async ({ page }) => {
  await uploadViaChooser(page, [{ name: 'not_a_partner.csv', text: 'foo,bar\n1,2\n' }]);
  await expect(page.getByRole('alert')).toContainText('not_a_partner.csv: Unrecognized CSV schema');
  await expect(fileRow(page, 'not_a_partner.csv')).toHaveCount(0);
});

test('only offers results from the same function for comparison', async ({ page }) => {
  await processViaApi(page, 'partner_c_baseline.csv', 'validation');
  await processViaApi(page, 'partner_c_baseline.csv', 'classification');
  await page.reload();

  await fileA(page).selectOption({ label: 'partner_c_baseline · Validation' });
  const optionsB = await fileB(page).locator('option').allTextContents();
  expect(optionsB).not.toContain('partner_c_baseline · Classification');
  expect(optionsB).not.toContain('partner_c_baseline · Validation');
  await expect(page.getByRole('button', { name: 'Compare Selected' })).toBeDisabled();
});
