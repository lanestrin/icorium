import type { CompareResult, FileMeta, FileRows, GeneratedBatch, GeneratorPartner, ProcessorId, ReplaceConflict } from '../../shared/types';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.message ?? res.statusText);
    // A refused re-run carries the existing result, so the app can ask before replacing it.
    if (res.status === 409 && body.existing) Object.assign(error, { conflict: body as ReplaceConflict });
    throw error;
  }
  return body as T;
}

/** Sends a JSON body with POST and reads the JSON answer. */
const postJson = <T>(url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(json<T>);

export const api = {
  list: () => fetch('/api/files').then(json<FileMeta[]>),
  rows: (id: string, offset = 0, limit = 100) => fetch(`/api/files/${id}/rows?offset=${offset}&limit=${limit}`).then(json<FileRows>),
  downloadUrl: (id: string) => `/api/files/${id}/download`,
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/files', { method: 'POST', body: fd }).then(json<FileMeta>);
  },
  /** replace: true only after the person confirmed replacing this input's existing result. */
  process: (fileId: string, processor: ProcessorId, replace?: boolean) =>
    postJson<FileMeta>('/api/process', replace ? { fileId, processor, replace: true } : { fileId, processor }),
  archive: (ids: string[], archived: boolean) =>
    postJson<FileMeta[]>('/api/files/archive', { ids, archived }),
  generate: (body: { partner: GeneratorPartner; rows: number; errorRows: number; files: number }) =>
    postJson<GeneratedBatch>('/api/generate', body),
  compare: (ids: string[]) => fetch(`/api/compare?ids=${ids.map(encodeURIComponent).join(',')}`).then(json<CompareResult>),
};
