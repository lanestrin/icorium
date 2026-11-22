import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../../../shared/types';
import { api } from '../../lib/api';
import { MappingDialog } from './MappingDialog';

vi.mock('../../lib/api', () => ({ api: { rows: vi.fn(), confirmMapping: vi.fn() } }));

const HEADERS = ['Batch ID', 'Sample Date', 'Net Mass', 'R32 %', 'R125', 'R134a', 'file_id'];
const mapping = (field: string, sourceColumn: string, origin: string) => ({ field, sourceColumn, origin, approved: false });
const file = {
  id: 'needmap', name: 'supplier.csv', rows: 3, columns: 7, uploadedAt: '2026-11-22T12:00:00Z', status: 'Needs Mapping',
  ingestion: {
    mappings: [
      mapping('batchId', 'Batch ID', 'normalized'), mapping('sampleDate', 'Sample Date', 'normalized'), mapping('massKg', 'Net Mass', 'alias'),
      mapping('r32', 'R32 %', 'alias'), mapping('r125', 'R125', 'alias'), mapping('r134a', 'R134a', 'alias'),
    ],
    units: [{ field: 'r32', unit: '%', factor: 1, origin: 'header' }],
    issues: [
      { severity: 'blocking', code: 'unit_unverified', field: 'massKg', reason: 'mass: no unit is stated; confirm kg, lb or g' },
      { severity: 'warning', code: 'unit_range_suspect', field: 'r32', reason: 'R-32: every value is 1 or less; check they are percent, not fractions' },
    ],
    duplicateHeaders: [], approved: false,
  },
} as unknown as FileMeta;
const page = (headers = HEADERS) => ({
  headers, offset: 0, totalRows: 3, generatedColumns: [], problems: { total: 0, items: [] },
  rows: [
    Object.fromEntries(headers.map((h, i) => [h, `${h}-a${i}`])), Object.fromEntries(headers.map((h, i) => [h, `${h}-b${i}`])),
    Object.fromEntries(headers.map((h, i) => [h, `${h}-c${i}`])),
  ],
});

const onClose = vi.fn();
const onConfirmed = vi.fn();
async function open(meta: FileMeta = file, headers = HEADERS) {
  vi.mocked(api.rows).mockResolvedValue(page(headers));
  const user = userEvent.setup();
  render(<MappingDialog file={meta} onClose={onClose} onConfirmed={onConfirmed} />);
  await screen.findByRole('table');
  return user;
}
const field = (header: string) => screen.getByRole('combobox', { name: `Field for column ${header}` });
const unit = (name: string) => screen.getByRole('combobox', { name: `${name} unit` });
const confirmButton = () => screen.getByRole('button', { name: 'Confirm mapping' });
const complete = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.selectOptions(unit('mass'), 'lb');
  await user.selectOptions(unit('R-125'), '%');
  await user.selectOptions(unit('R-134a'), '%');
};

beforeEach(() => { vi.resetAllMocks(); });

describe('MappingDialog', () => {
  it('shows the suggested mapping, units, samples, warnings and why processing is blocked', async () => {
    await open();
    expect(screen.getByText('Map columns: supplier.csv')).toBeInTheDocument();
    expect(screen.getByText('File ID needmap · 3 rows · Needs Mapping')).toBeInTheDocument();
    expect(api.rows).toHaveBeenCalledWith('needmap', 0, 3);
    expect(screen.queryByRole('combobox', { name: 'Field for column file_id' })).not.toBeInTheDocument();
    expect(field('Net Mass')).toHaveValue('massKg');
    expect(within(screen.getByRole('row', { name: /Net Mass/ })).getByText('a known alternative name')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Net Mass/ })).toHaveTextContent('Net Mass-a2, Net Mass-b2, Net Mass-c2');
    expect(unit('R-32')).toHaveValue('%');
    expect(screen.getByText('stated by the column name')).toBeInTheDocument();
    expect(unit('mass')).toHaveValue('');
    const blocked = screen.getByRole('region', { name: 'Why processing is blocked' });
    expect(blocked).toHaveTextContent('Confirm the unit for mass');
    expect(blocked).toHaveTextContent('Confirm the unit for R-125');
    expect(screen.getByRole('region', { name: 'Warnings' })).toHaveTextContent('R-32: every value is 1 or less');
    expect(confirmButton()).toBeDisabled();
  });

  it('becomes Ready to Confirm once every unit is chosen', async () => {
    const user = await open();
    await complete(user);
    expect(screen.getByText('File ID needmap · 3 rows · Ready to Confirm')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Why processing is blocked' })).not.toBeInTheDocument();
    expect(screen.getByText('Processing stays blocked until you confirm this mapping.')).toBeInTheDocument();
    expect(unit('mass')).toBeInTheDocument();
    expect(screen.getAllByText('chosen by you').length).toBeGreaterThan(0);
    expect(confirmButton()).toBeEnabled();
  });

  it('names a field chosen twice and a field with no column, and keeps Confirm disabled', async () => {
    const user = await open();
    await complete(user);
    await user.selectOptions(field('R125'), 'r32');
    const blocked = screen.getByRole('region', { name: 'Why processing is blocked' });
    expect(blocked).toHaveTextContent('R-32 is chosen for two columns');
    expect(blocked).toHaveTextContent('Choose a column for R-125');
    expect(field('R125')).toHaveAttribute('aria-invalid', 'true');
    expect(field('R125')).toHaveAccessibleDescription('R-32 is chosen for two columns');
    expect(field('R32 %')).toHaveAccessibleDescription('R-32 is chosen for two columns');
    expect(confirmButton()).toBeDisabled();
    await user.selectOptions(field('R125'), '');
    expect(field('R125')).toHaveDisplayValue('Not used');
  });

  it('confirms with the exact choices, leaving out a blank profile name', async () => {
    vi.mocked(api.confirmMapping).mockResolvedValue({} as FileMeta);
    const user = await open();
    await complete(user);
    await user.type(screen.getByLabelText('Save as supplier profile (optional)'), '   ');
    await user.click(confirmButton());
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({ name: 'supplier.csv' }));
    expect(api.confirmMapping).toHaveBeenCalledWith({
      fileId: 'needmap',
      columns: { batchId: 'Batch ID', sampleDate: 'Sample Date', massKg: 'Net Mass', r32: 'R32 %', r125: 'R125', r134a: 'R134a' },
      units: { massKg: 'lb', r32: '%', r125: '%', r134a: '%' },
    });
  });

  it('sends a trimmed supplier profile name when one is given', async () => {
    vi.mocked(api.confirmMapping).mockResolvedValue({} as FileMeta);
    const user = await open();
    await complete(user);
    await user.type(screen.getByLabelText('Save as supplier profile (optional)'), ' Supplier X ');
    await user.click(confirmButton());
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(api.confirmMapping).toHaveBeenCalledWith(expect.objectContaining({ profileName: 'Supplier X' }));
  });

  it("shows the file service's refusal, keeps the dialog and the choices, and allows another try", async () => {
    vi.mocked(api.confirmMapping).mockRejectedValueOnce(new Error('R-32: the column states % but fraction was confirmed'));
    const user = await open();
    await complete(user);
    await user.click(confirmButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('R-32: the column states % but fraction was confirmed');
    expect(screen.getByText('Map columns: supplier.csv')).toBeInTheDocument();
    expect(unit('mass')).toHaveValue('lb');
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(confirmButton()).toBeEnabled();
  });

  it('closes with the profile message when the mapping saved but the profile did not', async () => {
    vi.mocked(api.confirmMapping).mockRejectedValueOnce(new Error('The mapping was saved, but the supplier profile could not be saved: disk full'));
    const user = await open();
    await complete(user);
    await user.click(confirmButton());
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({
      name: 'supplier.csv', profileError: 'The mapping was saved, but the supplier profile could not be saved: disk full',
    }));
  });

  it('saves nothing on Cancel or Escape', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.confirmMapping).not.toHaveBeenCalled();
  });

  it('shows header and cell text as text, never as markup', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const headers = [hostile, ...HEADERS.slice(1)];
    const meta = { ...file, ingestion: { ...file.ingestion!, mappings: [mapping('batchId', hostile, 'normalized'), ...file.ingestion!.mappings.slice(1)] } } as FileMeta;
    await open(meta, headers);
    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('reports a file that cannot be read', async () => {
    vi.mocked(api.rows).mockRejectedValue(new Error('File not found'));
    render(<MappingDialog file={file} onClose={onClose} onConfirmed={onConfirmed} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('File not found');
    expect(confirmButton()).toBeDisabled();
  });
});
