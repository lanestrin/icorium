import { describe, expect, it } from 'vitest';
import { isInputFile, type FileMeta } from '../../shared/types';
import { displayStatus, processingFunction, qualityWarning, replacements, sortFiles } from './components/FileTable';

const file: FileMeta = { id: 'input', name: 'input.csv', rows: 25, columns: 7,
  uploadedAt: '2026-11-06T12:00:00Z', status: 'Needs Review', problemRows: 1 };

describe('file eligibility and feedback', () => {
  it.each(['Ready', 'Needs Review', 'Processed'] as const)('%s eligibility', (status) => {
    expect(isInputFile({ ...file, status })).toBe(status !== 'Processed');
  });
  it('prioritizes processing over failure and restores persistent status', () => {
    expect(displayStatus(file, file.id, new Set([file.id]))).toBe('Processing');
    expect(displayStatus(file, undefined, new Set([file.id]))).toBe('Error');
    expect(displayStatus(file)).toBe('Needs Review');
    expect(displayStatus({ ...file, status: 'Processed' })).toBe('Processed');
  });
});

describe('processing function label', () => {
  it('calls inputs Original and names the function that made a result', () => {
    expect(processingFunction({ ...file, status: 'Ready' })).toBe('Original');
    expect(processingFunction(file)).toBe('Original'); // Needs Review
    const result = { ...file, status: 'Processed' as const };
    expect(processingFunction({ ...result, processor: 'validation' })).toBe('Validation');
    expect(processingFunction({ ...result, processor: 'mass' })).toBe('Mass Calculation');
    expect(processingFunction({ ...result, processor: 'classification' })).toBe('Classification');
    expect(processingFunction(result)).toBe('—'); // a result whose function is unknown
  });
});

describe('sorting files', () => {
  const at = (id: string, uploadedAt: string, archivedAt?: string): FileMeta => ({ ...file, id, name: `${id}.csv`, uploadedAt, archivedAt });
  const files = [at('b', '2026-11-02'), at('A10', '2026-11-03', '2026-11-05'), at('a2', '2026-11-01', '2026-11-09'), at('c', '2026-11-02')];
  const ids = (key: Parameters<typeof sortFiles>[1]) => sortFiles(files, key).map((f) => f.id);

  it('orders by upload time, name or archive time, keeping ties in place', () => {
    expect(ids('uploaded-desc')).toEqual(['A10', 'b', 'c', 'a2']);
    expect(ids('uploaded-asc')).toEqual(['a2', 'b', 'c', 'A10']);
    expect(ids('name-asc')).toEqual(['a2', 'A10', 'b', 'c']); // numbers in names sort as numbers, case ignored
    expect(ids('name-desc')).toEqual(['c', 'b', 'A10', 'a2']);
    expect(ids('archived-desc')).toEqual(['a2', 'A10', 'b', 'c']); // never-archived files last, in their order
    expect(files.map((f) => f.id)).toEqual(['b', 'A10', 'a2', 'c']); // the input is not changed
  });
});

describe('data quality warning', () => {
  const clean: FileMeta = { ...file, id: 'clean', name: 'clean.csv', status: 'Ready', problemRows: 0 };
  const invalid: FileMeta = { ...file, id: 'invalid', name: 'invalid.csv', problemRows: 2 };

  it('never warns for Validation or for clean selections', () => {
    expect(qualityWarning([clean, invalid], 'validation')).toBeUndefined();
    expect(qualityWarning([clean], 'mass')).toBeUndefined();
    expect(qualityWarning([clean], 'classification')).toBeUndefined();
    expect(qualityWarning([], 'mass')).toBeUndefined();
  });
  it.each(['mass', 'classification'] as const)('reports per-file counts for a mixed %s selection', (processor) => {
    expect(qualityWarning([clean, invalid, { ...file, id: 'one', name: 'one.csv' }], processor)).toEqual({
      affected: [
        { id: 'invalid', name: 'invalid.csv', valid: 23, invalid: 2 },
        { id: 'one', name: 'one.csv', valid: 24, invalid: 1 },
      ],
      cleanCount: 1,
    });
  });
  it('treats a missing invalid count as clean', () => {
    expect(qualityWarning([{ ...clean, problemRows: undefined }], 'mass')).toBeUndefined();
  });
});

describe('results a run would replace', () => {
  const a: FileMeta = { ...file, id: '101010', name: 'same.csv' };
  const b: FileMeta = { ...file, id: '101011', name: 'same.csv' };
  const result = (id: string, extra: Partial<FileMeta> = {}): FileMeta =>
    ({ ...file, id, name: `result_${id}.csv`, status: 'Processed', processor: 'validation', ...extra });

  it('finds each input result by its File ID, active or archived, in batch order', () => {
    const files = [a, b, result('101011-V', { archived: true }), result('101010-V')];
    expect(replacements([a, b], 'validation', files)).toEqual([
      { inputId: '101010', resultId: '101010-V', resultName: 'result_101010-V.csv', archived: false },
      { inputId: '101011', resultId: '101011-V', resultName: 'result_101011-V.csv', archived: true },
    ]);
  });
  it('ignores inputs without a result and results of other functions or other inputs', () => {
    const files = [a, b, result('101010-M', { processor: 'mass' }), { ...result('101011-V'), name: 'same.csv' }];
    expect(replacements([a], 'validation', files)).toEqual([]);
    expect(replacements([a, b], 'classification', files)).toEqual([]);
  });
});
