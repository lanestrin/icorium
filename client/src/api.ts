import type { CompareResult, FileMeta, FileRows, ProcessorId } from '../../shared/types';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? res.statusText);
  return body as T;
}

export const api = {
  list: () => fetch('/api/files').then(json<FileMeta[]>),
  rows: (id: string, offset = 0, limit = 100) => fetch(`/api/files/${id}/rows?offset=${offset}&limit=${limit}`).then(json<FileRows>),
  downloadUrl: (id: string) => `/api/files/${id}/download`,
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/files', { method: 'POST', body: fd }).then(json<FileMeta>);
  },
  process: (fileId: string, processor: ProcessorId) =>
    fetch('/api/process', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileId, processor }),
    }).then(json<FileMeta>),
  compare: (a: string, b: string) => fetch(`/api/compare?a=${a}&b=${b}`).then(json<CompareResult>),
};
