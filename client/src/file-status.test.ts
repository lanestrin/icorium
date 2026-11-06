import { describe, expect, it } from 'vitest';
import { isInputFile, type FileMeta } from '../../shared/types';
import { displayStatus } from './components/FileTable';

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
