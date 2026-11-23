import { useEffect, useRef, useState } from 'react';
import type { FileMeta } from '../../../shared/types';
import { api } from '../lib/api';
import { WORKSPACE_CHANGED_MESSAGE } from '../lib/workspace';
import type { Prepared } from './useConversion';
import { errorMessage, type Report } from '../lib/format';

/**
 * The file list, reloaded on demand, and uploads into it. loading is true until the latest list request settles.
 * hold postpones the first load (the account is still being read, so there is no workspace to list yet).
 */
export function useFileList(onError: Report, hold = false) {
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
      .catch((e) => { if (request === listRequest.current) { setLoadFailed(true); onError(errorMessage(e)); } })
      .finally(() => { if (request === listRequest.current) setLoading(false); });
  };
  // Only the first load, and the first load of a different workspace, shows "Loading files…"; other refreshes keep the
  // current rows on screen. refresh never rejects (failures go to onError), so loading ends even after an error.
  useEffect(() => { if (!hold) void refresh(); }, [hold]);

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
    const workspace = api.workspaceId();
    let stopped = false;
    for (const f of list) {
      try {
        const ready = prepare ? await prepare(f) : { file: f };
        if (!ready) continue;
        const source = ready.source ? await ready.source() : undefined;
        // Reading and converting can take a while: the workspace may have changed since the upload began.
        if (api.workspaceId() !== workspace) { stopped = true; break; }
        const saved = await api.upload(ready.file, source);
        accepted++;
        if (saved?.status === 'Needs Mapping') needsMapping.push(saved);
      } catch (e) {
        errors.push(`${f.name}: ${errorMessage(e)}`);
      }
    }
    setUploading(false);
    if (stopped) errors.push(WORKSPACE_CHANGED_MESSAGE);
    if (errors.length) onError(`Upload failed\n${errors.join('\n')}`);
    await refresh();
    // Files saved before the switch belong to the old workspace: no filter or mapping dialog for them here.
    return stopped ? { accepted: 0, needsMapping: [] } : { accepted, needsMapping };
  }

  /** Forgets the files shown, for a different workspace: the old list must never appear under the new one. */
  const reset = () => { listRequest.current++; setFiles([]); setLoadFailed(false); setLoading(true); };

  return { files, refresh, reset, upload, uploading, loading, loadFailed };
}
