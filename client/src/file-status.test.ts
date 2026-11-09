import { describe, expect, it } from 'vitest';
import { isInputFile, type FileMeta } from '../../shared/types';
import { displayStatus, qualityWarning } from './components/FileTable';

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
