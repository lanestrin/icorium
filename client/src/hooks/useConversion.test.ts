import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReadProgress } from '../lib/convert/ocr';
import { useConversion, type ReadOutcome } from './useConversion';

const A = ['batch_id', 'sample_date', 'feed_mass_kg', 'r32_pct', 'r125_pct', 'r134a_pct'];
const sheet = [A, ['X-1', '2026-09-01', '100', '40', '30', '30']];

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
  const finish = (rows: string[][], ocr?: ReadOutcome['ocr']) => act(async () => pending.shift()?.(ocr ? { rows, ocr } : { rows }));
  return { read, signal, progress, finish };
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
    const rejected = expect(outcome).rejects.toThrow("No header row with a partner's columns was found in the first sheet.");
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
      .mockResolvedValueOnce({ rows: sheet });
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
    expect(result.current.review?.table.partner).toBe('Partner A');
    act(() => result.current.importReviewed());
    expect((await outcome)?.name).toBe('report.csv');
    expect(result.current.review).toBeNull();
  });
});
