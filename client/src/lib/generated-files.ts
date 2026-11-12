import type { GeneratedFile } from '../../../shared/types';

/** Generated values never contain commas or quotes, so a plain split is enough for the preview. */
export const splitCsv = (text: string) => text.split(/\r?\n/).filter(Boolean).map((line) => line.split(','));

/** The name with ".csv" added when it is missing. */
export const withCsv = (name: string) => (name.trim().toLowerCase().endsWith('.csv') ? name.trim() : `${name.trim()}.csv`);

/** Rows a file's planted errors flag (a duplicate batch ID is listed on both of its rows). */
export const flaggedRows = (file: GeneratedFile) => new Set(file.errors.map((e) => e.row)).size;
