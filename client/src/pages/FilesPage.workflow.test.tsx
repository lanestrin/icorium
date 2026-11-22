// The whole workflow with real files and no mocked results (build-plan 16.4): the real Files page, the real
// file service over a simulated IndexedDB (fake-indexeddb), the real SheetJS reader, the real sample CSVs and
// an Excel file made from one of them (scripts/make-excel-fixture.mjs). Only the browser's download plumbing,
// which jsdom lacks, is replaced so the saved file can be read back.
import 'fake-indexeddb/auto';
import { screen, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseCsv } from '../../../shared/csv';
import { FilesPage } from './FilesPage';
import { SAMPLE_FILES } from '../lib/samples';
import excelFixture from '../test-fixtures/partner_b_baseline.xlsx?inline';

/** The fixture's bytes: Vite inlines it as a base64 data URL. */
function excelFile() {
  const bytes = Uint8Array.from(atob(excelFixture.slice(excelFixture.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  return new File([bytes], 'partner_b_baseline.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const sampleCsv = (name: string) => new File([SAMPLE_FILES.find((f) => f.name === name)!.text], name, { type: 'text/csv' });
/** Real conversion and processing can take longer than findBy's default second. */
const slow = { timeout: 15_000 };
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
/** A file's row, found by its File ID (row controls are labelled "Select <id> <name>"). */
const rowOf = (id: string) => screen.getByRole('checkbox', { name: new RegExp(`^Select ${id} `) }).closest('tr')!;

describe('the whole workflow with real files', () => {
  it('uploads a sample CSV and an Excel file, processes, previews, downloads and compares them', async () => {
    const user = userEvent.setup();
    render(<FilesPage />);

    // Start: the five bundled samples.
    for (const id of ['100001', '100002', '100003', '100004', '100005']) expect(await screen.findByRole('checkbox', { name: new RegExp(`^Select ${id} `) })).toBeInTheDocument();

    // Upload the sample CSV: the next File ID, Needs Review for its planted problem row.
    await user.upload(fileInput(), sampleCsv('partner_b_baseline.csv'));
    await screen.findByRole('checkbox', { name: 'Select 100006 partner_b_baseline.csv' });
    expect(within(rowOf('100006')).getByText('Needs Review')).toBeInTheDocument();

    // Upload the Excel file: reviewed in the browser, then imported as a CSV.
    await user.upload(fileInput(), excelFile());
    const review = await screen.findByRole('dialog', { name: 'Review partner_b_baseline.xlsx' });
    expect(review).toHaveTextContent('Partner B · Lots A2:F27 · header on row 2 · 25 rows');
    await user.click(within(review).getByRole('button', { name: 'Import as CSV' }));
    await screen.findByRole('checkbox', { name: 'Select 100007 partner_b_baseline.csv' });
    expect(within(rowOf('100007')).getByText('Needs Review')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Run each function on both uploads. Mass and Classification first warn about the problem row.
    for (const [label, code] of [['Composition Validation', 'V'], ['Component Mass Calculation', 'M'], ['Batch Classification', 'C']] as const) {
      await user.click(screen.getByRole('checkbox', { name: 'Select 100006 partner_b_baseline.csv' }));
      await user.click(screen.getByRole('checkbox', { name: 'Select 100007 partner_b_baseline.csv' }));
      await user.click(screen.getByRole('radio', { name: new RegExp(label) }));
      await user.click(screen.getByRole('button', { name: 'Run Processing (2)' }));
      if (code !== 'V') {
        const warning = await screen.findByRole('dialog', { name: 'Data Quality Warning' });
        // Both the CSV and the Excel import: 25 rows, one of them invalid.
        expect(warning.textContent!.match(/24 valid rows · 1 invalid row/g)).toHaveLength(2);
        await user.click(within(warning).getByRole('button', { name: 'Process Valid Rows' }));
      }
      // A run of two files lists both results as Processed and selects them, ready to compare.
      for (const id of [`100006-${code}`, `100007-${code}`]) {
        const result = () => screen.getByRole('checkbox', { name: new RegExp(`^Select ${id} result_partner_b_baseline_`) });
        await waitFor(() => expect(result()).toBeChecked(), slow);
        expect(within(rowOf(id)).getByText('Processed')).toBeInTheDocument();
      }
      expect(screen.getByRole('status')).toHaveTextContent('Processed 2 files. Their results are selected, so you can compare them.');
      // Start the next run from every file and no selection.
      await user.click(within(screen.getByRole('toolbar', { name: 'Selected files' })).getByRole('button', { name: /Clear selection/ }));
      const clearFilters = screen.getByRole('button', { name: 'Clear filters' });
      if (!(clearFilters as HTMLButtonElement).disabled) await user.click(clearFilters);
    }

    // Preview the Excel import's Validation result: its generated columns, and row 5's planted problem.
    await user.click(within(rowOf('100007-V')).getByRole('button', { name: /^Actions for / }));
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Preview file' }));
    const preview = await screen.findByRole('dialog', { name: 'result_partner_b_baseline_validation.csv' });
    for (const column of ['result_id', 'composition_total_pct', 'processing_status', 'validation_errors']) {
      expect(await within(preview).findByRole('columnheader', { name: column }, slow)).toBeInTheDocument();
    }
    const flagged = within(preview).getAllByLabelText('Problem row').map((icon) => icon.closest('tr')!);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toHaveTextContent('B-005');
    expect(flagged[0]).toHaveTextContent('mass invalid');
    await user.keyboard('{Escape}');

    // Download the Excel import's Mass result: every original column, both File IDs on every row, the masses.
    const saved: { name: string; blob: Blob }[] = [];
    let blob: Blob | undefined;
    const restoreUrl = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    URL.createObjectURL = (b: Blob) => { blob = b; return 'blob:workflow'; };
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, blob: blob! });
    });
    try {
      await user.click(within(rowOf('100007-M')).getByRole('button', { name: /^Actions for / }));
      await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Download file' }));
      await waitFor(() => expect(saved).toHaveLength(1), slow);
    } finally {
      click.mockRestore();
      Object.assign(URL, { createObjectURL: restoreUrl.create, revokeObjectURL: restoreUrl.revoke });
    }
    expect(saved[0].name).toBe('result_partner_b_baseline_mass.csv');
    const downloaded = parseCsv(await saved[0].blob.text());
    const partnerB = ['lot_number', 'collected_on', 'weight_lb', 'hfc32_percent', 'hfc125_percent', 'hfc134a_percent'];
    expect(downloaded.headers).toEqual([...partnerB, 'file_id', 'result_id', 'r32_mass_kg', 'r125_mass_kg', 'r134a_mass_kg', 'processing_status', 'validation_errors']);
    expect(downloaded.rows).toHaveLength(25);
    expect(downloaded.rows.every((r) => r.file_id === '100007' && r.result_id === '100007-M')).toBe(true);
    expect(downloaded.rows[4]).toMatchObject({ lot_number: 'B-005', weight_lb: 'not_available', processing_status: 'Invalid', r32_mass_kg: '' });
    // Row 1: 266.713 lb at 37.09 % R-32.
    expect(Number(downloaded.rows[0].r32_mass_kg)).toBeCloseTo(266.713 * 0.45359237 * 0.3709, 2);

    // Compare the CSV upload's Mass result with the Excel import's: matched by batch ID, no row differs.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    try {
      await user.click(screen.getByRole('checkbox', { name: /^Select 100006-M / }));
      await user.click(screen.getByRole('checkbox', { name: /^Select 100007-M / }));
      await user.click(within(screen.getByRole('toolbar', { name: 'Selected files' })).getByRole('button', { name: 'Compare 2 files' }));
      const comparison = await screen.findByRole('dialog', { name: 'Compare Files' }, slow);
      const chips = within(within(comparison).getByRole('list', { name: 'Compared files' })).getAllByRole('listitem');
      expect(chips.map((c) => within(c).getByText(/^10000[67]-M$/).textContent).sort()).toEqual(['100006-M', '100007-M']);
      expect(comparison).toHaveTextContent('Rows matched by batch ID.');
      await user.click(within(within(comparison).getByRole('group', { name: 'View' })).getByRole('button', { name: 'Row differences' }));
      expect(await within(comparison).findByText(/^0 of 25 rows differ between files\./)).toBeInTheDocument();
      expect(within(comparison).getByText('No rows differ for this metric.')).toBeInTheDocument();
    } finally { vi.unstubAllGlobals(); }
  }, 60_000);
});
