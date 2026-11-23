import { useEffect, useRef, useState } from 'react';
import type { FileMeta } from '../../../shared/types';
import { api } from '../lib/api';
import type { Prepared } from './useConversion';
import { errorMessage, type Report } from '../lib/format';

/** The file list, reloaded on demand, and uploads into it. loading is true until the first list request settles. */
export function useFileList(onError: Report) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false); // the latest list request failed, so an empty list isn't "no files"

  // Each request is numbered and only the latest one's answer is used, so a slow older response
  // (e.g. from an upload during a processing batch) never overwrites newer data.
  const listRequest = useRef(0);
  const refresh = () => {
    const request = ++listRequest.current;
    return api.list()
      .then((list) => { if (request === listRequest.current) { setFiles(list); setLoadFailed(false); } })
      .catch((e) => { if (request === listRequest.current) { setLoadFailed(true); onError(errorMessage(e)); } });
  };
  // Only the first load shows "Loading files…"; later refreshes keep the current rows on screen.
  // refresh never rejects (failures go to onError), so this ends even after an error.
  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  /**
   * Uploads each file in turn, reports the ones that failed, and returns how many were saved and which of them
   * need their columns mapped (so the page can open the mapping dialog).
   * prepare, when given, runs first for each file: it returns the file to send (a converted CSV, with its source), or null
   * to skip it without an error (a cancelled conversion).
   */
  async function upload(list: File[], prepare?: (file: File) => Promise<Prepared | null>) {
    setUploading(true);
    onError(undefined);
    const errors: string[] = [];
    let accepted = 0;
    const needsMapping: FileMeta[] = [];
    for (const f of list) {
      try {
        const ready = prepare ? await prepare(f) : { file: f };
        if (!ready) continue;
        const saved = await api.upload(ready.file, ready.source ? await ready.source() : undefined);
        accepted++;
        if (saved?.status === 'Needs Mapping') needsMapping.push(saved);
      } catch (e) {
        errors.push(`${f.name}: ${errorMessage(e)}`);
      }
    }
    setUploading(false);
    if (errors.length) onError(`Upload failed\n${errors.join('\n')}`);
    await refresh();
    return { accepted, needsMapping };
  }

  /** Forgets the files shown, for a different workspace: the old list must never appear under the new one. */
  const reset = () => { listRequest.current++; setFiles([]); setLoadFailed(false); };

  return { files, refresh, reset, upload, uploading, loading, loadFailed };
}
