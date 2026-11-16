import { useEffect, useRef, useState } from 'react';
import type { FileMeta } from '../../../shared/types';
import { api } from '../lib/api';
import { errorMessage, type Report } from '../lib/format';

/** The file list, reloaded on demand, and uploads into it. loading is true until the first list request settles. */
export function useFileList(onError: Report) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Each request is numbered and only the latest one's answer is used, so a slow older response
  // (e.g. from an upload during a processing batch) never overwrites newer data.
  const listRequest = useRef(0);
  const refresh = () => {
    const request = ++listRequest.current;
    return api.list()
      .then((list) => { if (request === listRequest.current) setFiles(list); })
      .catch((e) => { if (request === listRequest.current) onError(errorMessage(e)); });
  };
  // Only the first load shows "Loading files…"; later refreshes keep the current rows on screen.
  // refresh never rejects (failures go to onError), so this ends even after an error.
  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  async function upload(list: File[]) {
    setUploading(true);
    onError(undefined);
    const errors: string[] = [];
    for (const f of list) {
      try { await api.upload(f); } catch (e) { errors.push(`${f.name}: ${errorMessage(e)}`); }
    }
    setUploading(false);
    if (errors.length) onError(`Upload failed\n${errors.join('\n')}`);
    await refresh();
  }

  return { files, refresh, upload, uploading, loading };
}
