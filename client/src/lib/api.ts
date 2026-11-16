import type { CompareResult, FileMeta, FileRows, GeneratedBatch, GeneratorPartner, ProcessorId, ReplaceConflict } from '../../../shared/types';

/**
 * The message for a failed response. The app's server always sends { message }, but errors from Vercel
 * itself (a body over 4.5 MB, a timeout, a crashed function) don't, and statusText is empty over HTTP/2,
 * so those get a message made from the status code.
 */
function errorMessage(status: number, body: { message?: unknown }): string {
  if (typeof body.message === 'string' && body.message !== '') return body.message;
  if (status === 413) return 'This file is too large to upload online. The limit is about 4.5 MB.';
  return `The server couldn't complete the request (error ${status}).`;
}

async function json<T>(res: Response): Promise<T> {
  // A body that isn't JSON (Vercel answers some errors as text or HTML) reads as {}.
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(errorMessage(res.status, body ?? {}));
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
