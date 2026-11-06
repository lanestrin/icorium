// Filters, keyboard use and phone width (build plan, Phase 7 manual checks).
import { expect, test } from '@playwright/test';
import { bigCsv, fileRow, sampleText, uniqueName, uploadViaChooser } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(fileRow(page, 'partner_a_baseline.csv')).toBeVisible();
});

test('search, status and date filters narrow the list, and Clear filters resets them', async ({ page }) => {
  const rows = page.locator('tbody tr');
  const clear = page.getByRole('button', { name: 'Clear filters' });
  await expect(clear).toBeHidden();

  await page.getByPlaceholder('Search CSV files...').fill('partner_b');
  await expect(fileRow(page, 'partner_a_baseline.csv')).toHaveCount(0);
  for (const text of await rows.allTextContents()) expect(text).toContain('partner_b');

  await page.getByRole('combobox', { name: /^Status/ }).selectOption('Processed');
  await expect(rows.filter({ hasText: 'Ready' })).toHaveCount(0);

  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA');
  await page.getByLabel('From date').fill(tomorrow);
  await expect(page.getByText('No CSV files match your filters.')).toBeVisible();

  await clear.click();
  await expect(fileRow(page, 'partner_a_baseline.csv')).toBeVisible();
  await expect(page.getByLabel('From date')).toHaveValue('');
  await expect(clear).toBeHidden();
});

test('rows can be selected and dialogs used from the keyboard', async ({ page }) => {
  const box = page.getByRole('checkbox', { name: 'Select partner_c_baseline.csv' });
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await expect(page.getByRole('button', { name: /Run Processing/ })).toBeEnabled();

  const preview = fileRow(page, 'partner_c_baseline.csv').getByRole('button', { name: 'Preview' });
  await preview.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'partner_c_baseline.csv' });
  await expect(dialog).toBeFocused();

  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1); // focus never leaves the dialog
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(preview).toBeFocused(); // focus returns to where it was
});

test('the select-all checkbox selects every input file but no results', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Select all input files' }).check();
  for (const name of ['partner_a_baseline.csv', 'partner_c_baseline.csv'])
    await expect(page.getByRole('checkbox', { name: `Select ${name}` })).toBeChecked();
  await expect(page.getByRole('button', { name: /Run Processing \(\d+\)/ })).toBeVisible();
});

test('previews a large CSV a page at a time', async ({ page }) => {
  const name = `${uniqueName('big')}.csv`;
  await uploadViaChooser(page, [{ name, text: bigCsv(250) }]);
  await expect(fileRow(page, name)).toContainText('250');

  await fileRow(page, name).getByRole('button', { name: 'Preview' }).click();
  const dialog = page.getByRole('dialog', { name });
  const more = dialog.getByRole('button', { name: /^Show \d+ more$/ });
  await expect(dialog.getByRole('row')).toHaveCount(101); // header + first 100
  await expect(dialog).toContainText('Showing 100 of 250 rows');

  await more.click();
  await expect(dialog.getByRole('row')).toHaveCount(201);
  await expect(more).toHaveText('Show 50 more');
  await more.click();
  await expect(dialog.getByRole('row')).toHaveCount(251);
  await expect(dialog).toContainText('Showing 250 of 250 rows');
  await expect(dialog.getByRole('cell', { name: 'X-250', exact: true })).toBeVisible();
  await expect(more).toHaveCount(0);
});

test('a long file list scrolls inside the table, with the header and footer staying in view', async ({ page }) => {
  const names = Array.from({ length: 12 }, () => `${uniqueName('bulk')}.csv`);
  await uploadViaChooser(page, names.map((name) => ({ name, text: sampleText('partner_c_baseline.csv') })));
  const last = fileRow(page, names[names.length - 1]);
  await expect(last).toBeAttached();

  const region = page.getByRole('region', { name: 'CSV files' });
  expect(await region.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const footerTop = (await page.getByRole('contentinfo').boundingBox())!.y;
  const box = (await region.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(footerTop); // the table never hides behind the footer

  const header = region.getByRole('columnheader', { name: 'File Name' });
  const headerY = (await header.boundingBox())!.y;
  await region.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(last).toBeInViewport();
  expect((await header.boundingBox())!.y).toBeCloseTo(headerY, 0); // header stays pinned
  expect(await page.evaluate(() => window.scrollY)).toBe(0); // the page itself did not scroll
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the page does not scroll sideways and the compare footer opens on tap', async ({ page }) => {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const toggle = page.getByRole('button', { name: 'Compare Files' });
    const compare = page.getByRole('button', { name: 'Compare Selected', includeHidden: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(compare).not.toBeInViewport();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(compare).toBeInViewport();
  });
});
