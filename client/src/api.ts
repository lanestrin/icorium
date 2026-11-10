import type { CompareResult, FileMeta, FileRows, GeneratedBatch, GeneratorPartner, ProcessorId } from '../../shared/types';

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
  archive: (ids: string[], archived: boolean) =>
    fetch('/api/files/archive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids, archived }),
    }).then(json<FileMeta[]>),
  generate: (body: { partner: GeneratorPartner; rows: number; errorRows: number; files: number }) =>
    fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(json<GeneratedBatch>),
  compare: (ids: string[]) => fetch(`/api/compare?ids=${ids.map(encodeURIComponent).join(',')}`).then(json<CompareResult>),
};
