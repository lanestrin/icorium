import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta, ReplaceConflict } from '../../../shared/types';
import { createApi, DOWNLOAD_URL_LIFETIME_MS, openWorkspace } from './api';
import { UPGRADE_BLOCKED_MESSAGE } from './browser-storage';
import { SAMPLE_FILES } from './samples';

// The real file service over a simulated IndexedDB (fake-indexeddb) and the real sample CSVs: nothing is mocked
// except the browser's download plumbing, which jsdom lacks.

let databases = 0;
const freshApi = () => createApi(() => openWorkspace(`api-test-${++databases}`));
const sample = (name: string) => SAMPLE_FILES.find((f) => f.name === name)!.text;
const csvFile = (name: string, text: string) => new File([text], name, { type: 'text/csv' });

let api: ReturnType<typeof createApi>;
beforeEach(() => { api = freshApi(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('browser API', () => {
  it('starts with the five samples as 100001 to 100005, in name order', async () => {
    const files = await api.list();
    expect(files.map((f) => [f.id, f.name])).toEqual([
      ['100001', 'partner_a_baseline.csv'],
      ['100002', 'partner_a_followup.csv'],
      ['100003', 'partner_b_baseline.csv'],
      ['100004', 'partner_b_followup.csv'],
      ['100005', 'partner_c_baseline.csv'],
    ]);
    expect(await api.storageMode()).toBe('saved');
  });

  it('uploads a CSV as the next File ID, and refuses a large or non-CSV file', async () => {
    expect(await api.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')))).toMatchObject({ id: '100006', name: 'mine.csv' });
    await expect(api.upload(csvFile('notes.txt', 'x'))).rejects.toThrow('Only .csv files are supported');
    const big = csvFile('big.csv', 'x');
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    await expect(api.upload(big)).rejects.toThrow('This file is larger than the 10 MB upload limit.');
  });

  it('refuses a second run without replace, naming the existing result, and replaces it when confirmed', async () => {
    const result = await api.process('100001', 'mass');
    expect(result).toMatchObject({ id: '100001-M', name: 'result_partner_a_baseline_mass.csv', status: 'Processed' });

    const refused = await api.process('100001', 'mass').catch((e: Error & { conflict?: ReplaceConflict }) => e);
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error).message).toBe('Component Mass Calculation has already been run for file 100001. Confirm to replace the existing result 100001-M.');
    expect((refused as { conflict?: ReplaceConflict }).conflict?.existing).toEqual({ id: '100001-M', name: result.name, archived: result.archived });

    expect((await api.process('100001', 'mass', true)).id).toBe('100001-M');
  });

  it('rejects other processing errors with their message only', async () => {
    const result = await api.process('100001', 'validation');
    const error = await api.process(result.id, 'validation').catch((e: unknown) => e);
    expect(error).toMatchObject({ message: 'Select an input file, not a result file' });
    expect(error).not.toHaveProperty('conflict');
  });

  it('pages a file\'s rows', async () => {
    const page = await api.rows('100001', 2, 3);
    expect(page).toMatchObject({ offset: 2, totalRows: 25 });
    expect(page.rows).toHaveLength(3);
    expect(page.rows[0].batch_id).toBe('A-003');
  });

  it('downloads a file as a CSV Blob under its name, and releases the URL later', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return 'blob:download'; });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this); });

    await api.download('100001');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('partner_a_baseline.csv');
    expect(clicked[0].href).toBe('blob:download');
    expect(clicked[0].isConnected).toBe(false);
    expect(created[0].type).toBe('text/csv;charset=utf-8');
    expect(await created[0].text()).toMatch(/^batch_id,sample_date,.*file_id\r?\nA-001,/);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOWNLOAD_URL_LIFETIME_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');

    await expect(api.download('999999')).rejects.toThrow('File not found');
  });

  it('archives and restores, compares two results and generates files', async () => {
    const [archived] = await api.archive(['100002'], true);
    expect(archived.archived).toBe(true);
    expect((await api.archive(['100002'], false))[0].archived).toBe(false);

    const a = await api.process('100001', 'mass');
    const b = await api.process('100002', 'mass');
    const comparison = await api.compare([a.id, b.id]);
    expect(comparison.files.map((f) => f.id)).toEqual([a.id, b.id]);
    await expect(api.compare([a.id])).rejects.toThrow('Choose 2 to 5 results to compare');

    expect((await api.generate({ partner: 'B', rows: 4, errorRows: 1, files: 2 })).files).toHaveLength(2);
  });

  it('clears every upload and result, brings the samples back and numbers the next upload 100006 again', async () => {
    await api.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')));
    await api.process('100001', 'validation');
    await api.archive(['100003'], true);

    await api.clearData();
    const files = await api.list();
    expect(files.map((f) => f.id)).toEqual(['100001', '100002', '100003', '100004', '100005']);
    expect(files.every((f: FileMeta) => !f.archived)).toBe(true);
    expect((await api.upload(csvFile('again.csv', sample('partner_a_baseline.csv')))).id).toBe('100006');
  });

  it('reports a blocked upgrade instead of falling back to memory, and the next call tries again', async () => {
    const name = `api-blocked-${++databases}`;
    const oldTab = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('meta', { keyPath: 'id' }); request.result.createObjectStore('files'); };
      request.onsuccess = () => resolve(request.result);
    });
    const blockedApi = createApi(() => openWorkspace(name));
    await expect(blockedApi.list()).rejects.toThrow(UPGRADE_BLOCKED_MESSAGE);
    oldTab.close();
    expect(await blockedApi.list()).toHaveLength(5);
    expect(await blockedApi.storageMode()).toBe('saved');
  });

  it('keeps files in memory, and says so, when the browser will not open IndexedDB', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('Storage disabled', 'SecurityError'); });
    const memoryApi = createApi(() => openWorkspace('blocked'));
    expect(await memoryApi.storageMode()).toBe('memory');
    expect(await memoryApi.list()).toHaveLength(5);
    expect((await memoryApi.upload(csvFile('mine.csv', sample('partner_a_baseline.csv')))).id).toBe('100006');
  });
});
