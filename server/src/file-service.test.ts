import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileService, type FileService } from '../../shared/file-service';
import { parseCsv } from '../../shared/csv';
import type { FileMeta } from '../../shared/types';
import { openLocalStorage } from './lib/storage';

// The file service called directly, with no HTTP layer, as the browser will call it (16.2).

const sample = (name: string) => fs.readFileSync(path.resolve(import.meta.dirname, '../../sample-data', name), 'utf8');

let files: FileService;
beforeEach(async () => {
  files = createFileService(await openLocalStorage(fs.mkdtempSync(path.join(os.tmpdir(), 'reclaim-service-'))));
});

/** The saved file of a process() call that is expected to succeed. */
async function processed(fileId: string, processor: string, replace?: boolean) {
  const outcome = await files.process({ fileId, processor, replace });
  if (!('file' in outcome)) throw new Error(`Expected a saved result, got ${JSON.stringify(outcome)}`);
  return outcome.file;
}

describe('file service', () => {
  it('uploads, processes, pages, downloads, archives and restores a file', async () => {
    const input = await files.upload({ name: 'partner_a_baseline.csv', text: sample('partner_a_baseline.csv') });
    expect(input).toMatchObject({ id: '100001', name: 'partner_a_baseline.csv', status: 'Needs Review' });
    expect(await files.list()).toEqual([input]);

    const result = await processed(input.id, 'mass');
    expect(result).toMatchObject({ id: '100001-M', name: 'result_partner_a_baseline_mass.csv', sourceId: '100001', status: 'Processed' });

    const page = await files.rows(result.id, { offset: '1', limit: '2' });
    expect(page).toMatchObject({ offset: 1, totalRows: input.rows, generatedColumns: result.generatedColumns });
    expect(page.rows).toHaveLength(2);

    const download = await files.download(result.id);
    expect(download.name).toBe(result.name);
    expect(parseCsv(download.text).rows).toHaveLength(input.rows);

    const [archived] = await files.archive({ ids: [input.id], archived: true });
    expect(archived).toMatchObject({ id: input.id, archived: true });
    expect(archived.archivedAt).toEqual(expect.any(String));
    const [restored] = await files.archive({ ids: [input.id], archived: false });
    expect(restored.archived).toBe(false);
    expect(restored.archivedAt).toBeUndefined();
  });

  it('returns the existing result as a conflict on a re-run without replace, and replaces it with replace', async () => {
    const input = await files.upload({ name: 'partner_a_baseline.csv', text: sample('partner_a_baseline.csv') });
    const first = await processed(input.id, 'validation');

    expect(await files.process({ fileId: input.id, processor: 'validation' })).toEqual({
      conflict: {
        message: `Composition Validation has already been run for file ${input.id}. Confirm to replace the existing result ${first.id}.`,
        existing: { id: first.id, name: first.name, archived: first.archived },
      },
    });

    const replaced = await processed(input.id, 'validation', true);
    expect(replaced.id).toBe(first.id);
    expect((await files.list()).filter((f) => f.id === first.id)).toHaveLength(1);
  });

  it('compares two results', async () => {
    const a = await files.upload({ name: 'partner_a_baseline.csv', text: sample('partner_a_baseline.csv') });
    const b = await files.upload({ name: 'partner_a_followup.csv', text: sample('partner_a_followup.csv') });
    const results = [await processed(a.id, 'mass'), await processed(b.id, 'mass')];

    const comparison = await files.compare(results.map((r) => r.id));
    expect(comparison.files.map((f) => f.id)).toEqual(results.map((r) => r.id));
    // Each file's problems match the problem rows saved with its result.
    expect(comparison.files.map((f) => f.problems.total)).toEqual(results.map((r) => r.problemRows));
  });

  it('generates files without saving them', async () => {
    const { files: generated } = files.generate({ partner: 'A', rows: 3, errorRows: 1, files: 2 });
    expect(generated).toHaveLength(2);
    expect(await files.list()).toEqual([]);
  });

  describe('refuses bad input with a 400 naming the problem', () => {
    const rejects400 = (promise: Promise<unknown>, message: string) => expect(promise).rejects.toMatchObject({ statusCode: 400, message });

    it('in an upload', async () => {
      await rejects400(files.upload({ name: 'notes.txt', text: 'x' }), 'Only .csv files are supported');
    });

    it('in rows, process and archive', async () => {
      const input = await files.upload({ name: 'partner_a_baseline.csv', text: sample('partner_a_baseline.csv') });
      await rejects400(files.rows(input.id, { limit: '0' }), 'Too small: expected number to be >=1');
      await rejects400(files.process({}), 'Invalid input: expected string, received undefined; Invalid option: expected one of "validation"|"mass"|"classification"');
      await rejects400(files.archive({ ids: [] }), 'Too small: expected array to have >=1 items; Invalid input: expected boolean, received undefined');
      const result = await processed(input.id, 'mass');
      await rejects400(files.process({ fileId: result.id, processor: 'mass' }), 'Select an input file, not a result file');
    });

    it('in compare and generate', async () => {
      const input = await files.upload({ name: 'partner_a_baseline.csv', text: sample('partner_a_baseline.csv') });
      const result: FileMeta = await processed(input.id, 'mass');
      await rejects400(files.compare([result.id]), 'Choose 2 to 5 results to compare');
      await rejects400(files.compare([result.id, result.id]), 'Choose different files');
      expect(() => files.generate({ partner: 'Z', rows: 1.5, errorRows: 3 })).toThrow(expect.objectContaining({ statusCode: 400, message: 'Choose partner A, B or C; Rows must be a whole number' }));
    });
  });

  it('answers 404 for a file that does not exist', async () => {
    await expect(files.download('999999')).rejects.toMatchObject({ statusCode: 404 });
  });
});
