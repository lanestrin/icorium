import type { GeneratorPartner, ProcessorId } from '../../../shared/types';
import { createFileService, seedSampleFiles, type FileService } from '../../../shared/file-service';
import { createMemoryStorage, openBrowserStorage, type BrowserStorage } from './browser-storage';
import { SAMPLE_FILES } from './samples';

// The app's file actions, run in the browser: the shared file service over browser storage. Nothing is
// sent to a server. Callers get the same results and messages the API used to send.

/** Largest CSV upload, in megabytes, as on the server. */
export const UPLOAD_MAX_MB = 10;
/** How long a download's object URL is kept before it is released, so the browser has time to start the download. */
export const DOWNLOAD_URL_LIFETIME_MS = 60_000;

/** saved: files are kept in IndexedDB on this device. memory: the browser blocked IndexedDB, so files last until a refresh. */
export type StorageMode = 'saved' | 'memory';
export interface Workspace { storage: BrowserStorage; mode: StorageMode }

/** Opens IndexedDB, or keeps files in memory when the browser won't open it (storage turned off, some private windows). */
export async function openWorkspace(name?: string): Promise<Workspace> {
  try {
    return { storage: await openBrowserStorage(name), mode: 'saved' };
  } catch {
    return { storage: createMemoryStorage(), mode: 'memory' };
  }
}

/** The file actions over the workspace open() gives. It opens on first use, with the five samples seeded. */
export function createApi(open: () => Promise<Workspace>) {
  let opening: Promise<{ workspace: Workspace; files: FileService }> | undefined;
  function opened() {
    opening ??= open()
      .then(async (workspace) => {
        await seedSampleFiles(workspace.storage, SAMPLE_FILES);
        return { workspace, files: createFileService(workspace.storage) };
      })
      .catch((error) => {
        opening = undefined; // the next call tries again
        throw error;
      });
    return opening;
  }
  const files = async () => (await opened()).files;

  return {
    list: async () => (await files()).list(),
    rows: async (id: string, offset = 0, limit = 100) => (await files()).rows(id, { offset, limit }),
    /** Saves the file's CSV to the person's downloads under its name. */
    download: async (id: string) => {
      const { name, text } = await (await files()).download(id);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
    },
    upload: async (file: File) => {
      if (file.size > UPLOAD_MAX_MB * 1024 * 1024) throw new Error(`This file is larger than the ${UPLOAD_MAX_MB} MB upload limit.`);
      const service = await files();
      return service.upload({ name: file.name, text: await file.text() });
    },
    /** replace: true only after the person confirmed replacing this input's existing result. */
    process: async (fileId: string, processor: ProcessorId, replace?: boolean) => {
      const outcome = await (await files()).process(replace ? { fileId, processor, replace: true } : { fileId, processor });
      // A refused re-run carries the existing result, so the app can ask before replacing it.
      if ('conflict' in outcome) throw Object.assign(new Error(outcome.conflict.message), { conflict: outcome.conflict });
      return outcome.file;
    },
    archive: async (ids: string[], archived: boolean) => (await files()).archive({ ids, archived }),
    generate: async (body: { partner: GeneratorPartner; rows: number; errorRows: number; files: number }) => (await files()).generate(body),
    compare: async (ids: string[]) => (await files()).compare(ids),
    storageMode: async (): Promise<StorageMode> => (await opened()).workspace.mode,
    /** Clear my data: deletes every file and result, then brings the five samples back. */
    clearData: async () => {
      const current = await opened();
      await current.workspace.storage.clear();
      await seedSampleFiles(current.workspace.storage, SAMPLE_FILES);
      current.files = createFileService(current.workspace.storage); // starts with an empty parsed-file cache
    },
  };
}

export const api = createApi(() => openWorkspace());
