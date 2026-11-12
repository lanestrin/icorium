import { useEffect, useState, type MutableRefObject } from 'react';
import { api } from '../lib/api';
import { errorMessage, plural, type Report } from '../lib/format';

/** How long the archive/restore toast stays up. */
export const TOAST_MS = 8000;

/** Archive/restore confirmation. undo reverses exactly the files it names. */
export interface Toast { title: string; detail: string; undo?: { ids: string[]; archive: boolean } }

/**
 * Archiving and restoring, with the confirmation toast. busy is shared with processing, so an archive
 * and a processing batch never run at the same time.
 */
export function useArchive({ busy, refresh, deselect, onError }: {
  busy: MutableRefObject<boolean>; refresh: () => Promise<void>; deselect: (ids: string[]) => void; onError: Report;
}) {
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState<Toast>();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  /** Archives the given files, or restores them when archive is false. undoable adds Undo to the toast. */
  async function setArchived(ids: string[], archive: boolean, undoable = true) {
    if (!ids.length || busy.current) return;
    busy.current = true;
    setArchiving(true);
    onError(undefined);
    setToast(undefined);
    try {
      await api.archive(ids, archive);
      deselect(ids);
      setToast({
        title: `${plural(ids.length)} ${archive ? 'archived' : 'restored'}`,
        detail: archive ? 'Moved out of Active Files.' : 'Back in Active Files.',
        undo: undoable ? { ids, archive: !archive } : undefined,
      });
    } catch (e) {
      onError(`${archive ? 'Archive' : 'Restore'} failed: ${errorMessage(e)}`);
    }
    await refresh();
    busy.current = false;
    setArchiving(false);
  }

  return { archiving, toast, dismissToast: () => setToast(undefined), setArchived };
}
