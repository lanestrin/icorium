import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMeta } from '../../shared/types';
import { api } from './api';
import { TOAST_MS, useArchive, useFileList, useSelection } from './hooks';

vi.mock('./api', () => ({ api: { list: vi.fn(), archive: vi.fn() } }));

const file = (id: string): FileMeta => ({ id, name: `${id}.csv`, rows: 1, columns: 6, uploadedAt: '2026-11-06T12:00:00Z', status: 'Ready' });

/** A promise the test settles by hand, to control which request answers first. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => vi.mocked(api.list).mockResolvedValue([]));
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe('useSelection', () => {
  it('toggles one file and checks or clears many', () => {
    const { result } = renderHook(() => useSelection());
    act(() => result.current.toggle('a'));
    expect([...result.current.selectedIds]).toEqual(['a']);
    act(() => result.current.toggleAll(['a', 'b', 'c'], true));
    expect([...result.current.selectedIds]).toEqual(['a', 'b', 'c']);
    act(() => result.current.toggle('b'));
    act(() => result.current.toggleAll(['a'], false));
    expect([...result.current.selectedIds]).toEqual(['c']);
  });
});

describe('useFileList', () => {
  it('keeps the newest list when an older request answers last', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useFileList(onError));
    await act(async () => {}); // the first load
    const older = deferred<FileMeta[]>();
    const newer = deferred<FileMeta[]>();
    vi.mocked(api.list).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = result.current.refresh(); second = result.current.refresh(); });
    await act(async () => { newer.resolve([file('new')]); await second; });
    await act(async () => { older.resolve([file('old')]); await first; });
    expect(result.current.files.map((f) => f.id)).toEqual(['new']);
    expect(onError).not.toHaveBeenCalledWith(expect.any(String));
  });
});

describe('useArchive', () => {
  const setup = () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const deselect = vi.fn();
    const onError = vi.fn();
    const busy = { current: false };
    const hook = renderHook(() => useArchive({ busy, refresh, deselect, onError }));
    return { ...hook, refresh, deselect, onError, busy };
  };

  it('confirms an archive with an undoable toast that clears itself', async () => {
    vi.useFakeTimers();
    vi.mocked(api.archive).mockResolvedValue([]);
    const { result, deselect, refresh, busy } = setup();
    await act(async () => { await result.current.setArchived(['a', 'b'], true); });
    expect(api.archive).toHaveBeenCalledWith(['a', 'b'], true);
    expect(deselect).toHaveBeenCalledWith(['a', 'b']);
    expect(refresh).toHaveBeenCalled();
    expect(busy.current).toBe(false);
    expect(result.current.toast).toEqual({ title: '2 files archived', detail: 'Moved out of Active Files.', undo: { ids: ['a', 'b'], archive: false } });
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(result.current.toast).toBeDefined();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toast).toBeUndefined();
  });

  it('reports a failed archive, shows no toast and still reloads the list', async () => {
    vi.mocked(api.archive).mockRejectedValue(new Error('Network error'));
    const { result, onError, refresh, deselect } = setup();
    await act(async () => { await result.current.setArchived(['a'], true); });
    expect(onError).toHaveBeenLastCalledWith('Archive failed: Network error');
    expect(result.current.toast).toBeUndefined();
    expect(deselect).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(result.current.archiving).toBe(false);
  });

  it('does nothing while another archive or a processing batch holds the lock', async () => {
    const { result, busy } = setup();
    busy.current = true;
    await act(async () => { await result.current.setArchived(['a'], true); });
    expect(api.archive).not.toHaveBeenCalled();
  });
});
