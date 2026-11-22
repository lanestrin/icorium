import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReadProgress } from '../lib/convert/ocr';
import type { FoundTable } from '../lib/convert/table';
import { useConversion, type ReadByOcr, type ReadOutcome } from './useConversion';

const A = ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
const sheet = [A, ['X-1', '2026-09-01', '100', '40', '30', '30']];
/** Rows of cell text as one page of cells laid out in columns 100 apart; an image has no page. */
const pages = (rows: string[][], image = false) => [{ ...(image ? {} : { page: 1 }), ocr: image, rows: rows.map((r) => r.map((text, c) => ({ text, x: c * 100, right: c * 100 + text.length * 5 }))) }];

type Kind = 'excel' | 'pdf' | 'image';
/** A reader whose results arrive only when the test calls finish, oldest call first. */
function slowReader() {
  const pending: ((outcome: ReadOutcome) => void)[] = [];
  const read = vi.fn((_file: File, _kind: Kind, _signal: AbortSignal, _onProgress: (progress: ReadProgress) => void) =>
    new Promise<ReadOutcome>((resolve) => { pending.push(resolve); }));
  /** The signal the reader was given on its nth call (0-based). */
  const signal = (call = 0) => read.mock.calls[call][2];
  /** Reports progress from the reader's nth call, as a reader does while it works. */
  const progress = (value: ReadProgress, call = 0) => act(() => read.mock.calls[call][3](value));
  const finish = (rows: string[][], ocr?: ReadByOcr) => act(async () => pending.shift()?.({ pages: pages(rows, ocr === 'image'), ...(ocr ? { ocr } : {}) }));
  const finishTables = (tables: FoundTable[]) => act(async () => pending.shift()?.({ tables }));
  return { read, signal, progress, finish, finishTables };
}

describe('useConversion', () => {
  it('passes a CSV straight through without reading it', async () => {
    const { read } = slowReader();
    const { result } = renderHook(() => useConversion(read));
    const csv = new File(['a'], 'data.csv');
    await expect(result.current.prepare(csv)).resolves.toBe(csv);
    expect(read).not.toHaveBeenCalled();
  });

  it('resolves null on cancel and ignores the reader when it finishes later', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    let outcome!: Promise<File | null>;
    act(() => { outcome = result.current.prepare(new File(['x'], 'report.xlsx')); });
    expect(result.current.reading).toBe('Reading report.xlsx…');
    expect(reader.signal().aborted).toBe(false);
    act(() => result.current.cancel());
    await expect(outcome).resolves.toBeNull();
    expect(reader.signal().aborted).toBe(true); // the reader is told to stop
    await reader.finish(sheet);
    expect(result.current.review).toBeNull(); // the late result never opens a review
    expect(result.current.reading).toBeNull();
  });

  it('cancels the job in progress when it unmounts', async () => {
    const reader = slowReader();
    const { result, unmount } = renderHook(() => useConversion(reader.read));
    let outcome!: Promise<File | null>;
    act(() => { outcome = result.current.prepare(new File(['x'], 'report.xlsx')); });
    unmount();
    await expect(outcome).resolves.toBeNull();
    expect(reader.signal().aborted).toBe(true);
    await reader.finish(sheet);
  });

  it('starting a new file cancels the one before it, whose late result is ignored', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    let earlier!: Promise<File | null>;
    act(() => { earlier = result.current.prepare(new File(['x'], 'one.xlsx')); });
    act(() => { void result.current.prepare(new File(['y'], 'two.xlsx')); });
    await expect(earlier).resolves.toBeNull();
    expect(reader.signal(0).aborted).toBe(true);
    expect(reader.signal(1).aborted).toBe(false);
    await reader.finish(sheet); // one.xlsx finishes late
    expect(result.current.review).toBeNull();
    expect(result.current.reading).toBe('Reading two.xlsx…');
  });

  it('rejects with the reader or table error, ready to show', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    let outcome!: Promise<File | null>;
    act(() => { outcome = result.current.prepare(new File(['x'], 'report.xlsx')); });
    // Attach the expectation first, as the upload loop awaits prepare, so the rejection is always handled.
    const rejected = expect(outcome).rejects.toThrow("No header row with a partner's columns was found in the workbook.");
    await reader.finish([['name'], ['a']]);
    await rejected;
    expect(result.current.reading).toBeNull();
  });

  it('reads a PDF with the PDF reader and names the PDF when no header is found', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    let outcome!: Promise<File | null>;
    const pdf = new File(['x'], 'scan.PDF');
    act(() => { outcome = result.current.prepare(pdf); });
    expect(reader.read).toHaveBeenCalledWith(pdf, 'pdf', expect.any(AbortSignal), expect.any(Function));
    const rejected = expect(outcome).rejects.toThrow("No header row with a partner's columns was found in the PDF.");
    await reader.finish([['name'], ['a']]);
    await rejected;
  });

  it('ignores a reader that fails after its job was cancelled, and reads the next file', async () => {
    let fail!: (error: Error) => void;
    const read = vi.fn()
      .mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }))
      .mockResolvedValueOnce({ pages: pages(sheet) });
    const { result } = renderHook(() => useConversion(read));
    let first!: Promise<File | null>;
    act(() => { first = result.current.prepare(new File(['x'], 'one.pdf')); });
    act(() => result.current.cancel());
    await expect(first).resolves.toBeNull();
    await act(async () => fail(new DOMException('Aborted', 'AbortError')));
    let second!: Promise<File | null>;
    await act(async () => { second = result.current.prepare(new File(['y'], 'two.pdf')); });
    expect(result.current.review?.name).toBe('two.pdf');
    act(() => result.current.importReviewed());
    expect((await second)?.name).toBe('two.csv');
  });

  it('shows which page is being read, and when OCR is getting ready, until the review opens', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    act(() => { void result.current.prepare(new File(['x'], 'scan.pdf')); });
    const seen = [result.current.reading];
    for (const value of [{ stage: 'page', page: 1, pages: 3 }, { stage: 'preparing' }, { stage: 'page', page: 2, pages: 3 }, { stage: 'page', page: 3, pages: 3 }] as ReadProgress[]) {
      await reader.progress(value);
      seen.push(result.current.reading);
    }
    expect(seen).toEqual([
      'Reading scan.pdf…',
      'Reading scan.pdf: page 1 of 3…',
      'Getting OCR ready (the first time downloads about 10 MB)…',
      'Reading scan.pdf: page 2 of 3…',
      'Reading scan.pdf: page 3 of 3…',
    ]);
    await reader.finish(sheet, [2, 3]);
    expect(result.current.reading).toBeNull();
    expect(result.current.review).toMatchObject({ name: 'scan.pdf', ocr: [2, 3] });
  });

  it('ignores progress from a reader whose job was cancelled', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    act(() => { void result.current.prepare(new File(['x'], 'scan.pdf')); });
    act(() => result.current.cancel());
    await reader.progress({ stage: 'page', page: 2, pages: 5 });
    expect(result.current.reading).toBeNull();
  });

  it('reads an image with OCR, marks the review as read by OCR, and names the image when no header is found', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    const photo = new File(['x'], 'table.JPG');
    act(() => { void result.current.prepare(photo); });
    expect(reader.read).toHaveBeenCalledWith(photo, 'image', expect.any(AbortSignal), expect.any(Function));
    await reader.finish(sheet, 'image');
    expect(result.current.review).toMatchObject({ name: 'table.JPG', ocr: 'image' });
    act(() => result.current.cancel());

    let outcome!: Promise<File | null>;
    act(() => { outcome = result.current.prepare(new File(['x'], 'blank.png')); });
    const rejected = expect(outcome).rejects.toThrow("No header row with a partner's columns was found in the image.");
    await reader.finish([['name'], ['a']], 'image');
    await rejected;
  });

  it('leaves the OCR mark off a review that OCR did not read', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    act(() => { void result.current.prepare(new File(['x'], 'report.pdf')); });
    await reader.finish(sheet);
    expect(result.current.review).not.toHaveProperty('ocr');
  });

  it('hands back the reviewed table as a CSV on import', async () => {
    const reader = slowReader();
    const { result } = renderHook(() => useConversion(reader.read));
    let outcome!: Promise<File | null>;
    act(() => { outcome = result.current.prepare(new File(['x'], 'report.xlsx')); });
    await reader.finish(sheet);
    expect(result.current.review).toMatchObject({ chosen: 0, tables: [{ partner: 'Partner A' }] });
    act(() => result.current.importReviewed());
    expect((await outcome)?.name).toBe('report.csv');
    expect(result.current.review).toBeNull();
  });

  describe('Excel files with several tables', () => {
    const table = (name: string): FoundTable => ({ partner: '', headerRow: 1, headers: ['Lot', 'Mass'], sheet: name, range: 'A1:B2', rows: [{ sourceRow: 2, cells: [name, '1'] }], flags: [] });

    async function openWithTables(tables: FoundTable[]) {
      const reader = slowReader();
      const hook = renderHook(() => useConversion(reader.read));
      let outcome!: Promise<File | null>;
      act(() => { outcome = hook.result.current.prepare(new File(['x'], 'report.xlsx')); });
      await reader.finishTables(tables);
      return { result: hook.result, outcome };
    }

    it('chooses the only table for the person, but none of several', async () => {
      expect((await openWithTables([table('One')])).result.current.review?.chosen).toBe(0);
      expect((await openWithTables([table('One'), table('Two')])).result.current.review?.chosen).toBeNull();
    });

    it('does nothing on import until a table is chosen, then uploads only the chosen one', async () => {
      const { result, outcome } = await openWithTables([table('One'), table('Two')]);
      act(() => result.current.importReviewed());
      expect(result.current.review).not.toBeNull();
      act(() => result.current.choose(7)); // not a table
      expect(result.current.review?.chosen).toBeNull();
      act(() => result.current.choose(1));
      act(() => result.current.importReviewed());
      const file = await outcome;
      expect(file?.name).toBe('report.csv');
      expect(await file?.text()).toBe('Lot,Mass\nTwo,1\n');
    });
  });

  describe('values to confirm in a PDF or image', () => {
    // The second row's mass has a lost minus sign, so it is listed; the first row has nothing to confirm.
    const doubtful = [A, ['X-1', '2026-09-01', '100', '40', '30', '30'], ['X-2', '2026-09-02', '12.5-', '40', '30', '30']];

    async function openPdf() {
      const reader = slowReader();
      const hook = renderHook(() => useConversion(reader.read));
      let outcome!: Promise<File | null>;
      act(() => { outcome = hook.result.current.prepare(new File(['x'], 'report.pdf')); });
      await reader.finish(doubtful);
      return { result: hook.result, outcome };
    }

    it('does not import while a value is undecided', async () => {
      const { result } = await openPdf();
      const [check] = result.current.review!.tables[0].checks!;
      expect(check).toMatchObject({ id: '3:2', value: '12.5-' });
      act(() => result.current.importReviewed());
      expect(result.current.review).not.toBeNull();
      act(() => result.current.decide(check.id, 'keep'));
      expect(result.current.review?.decisions).toEqual({ '3:2': 'keep' });
    });

    it('uploads a kept value exactly as read', async () => {
      const { result, outcome } = await openPdf();
      act(() => result.current.decide('3:2', 'keep'));
      act(() => result.current.importReviewed());
      expect(await (await outcome)?.text()).toContain('X-2,2026-09-02,12.5-,40,30,30');
    });

    it('uploads a value left blank as an empty cell, never zero', async () => {
      const { result, outcome } = await openPdf();
      act(() => result.current.decide('3:2', 'blank'));
      act(() => result.current.importReviewed());
      const csv = await (await outcome)?.text();
      expect(csv).toContain('X-2,2026-09-02,,40,30,30');
      expect(csv).toContain('X-1,2026-09-01,100,40,30,30'); // other values stay as read
    });
  });
});
