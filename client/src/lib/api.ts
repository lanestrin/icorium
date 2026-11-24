import type { UploadSource } from '../../../shared/ingestion';
import type { GeneratorPartner, ProcessorId } from '../../../shared/types';
import { createFileService, seedSampleFiles, type FileService } from '../../../shared/file-service';
import { httpError } from '../../../shared/csv';
import type { Storage } from '../../../shared/storage';
import { createMemoryStorage, openBrowserStorage, UPGRADE_BLOCKED_STATUS, type BrowserStorage } from './browser-storage';
import { createCloudStorage, INACTIVE_MESSAGE, UNAVAILABLE_FILES_MESSAGE } from './cloud-storage';
import { workspaceKey, type WorkspaceChoice } from './workspace';
import { SAMPLE_FILES } from './samples';
import { getSupabase, isAuthConfigured } from './supabase';

// The app's file actions, run in the browser: the shared file service over the account's workspace, which is
// browser storage (nothing is sent to a server) or, for a signed-in active account, its private Supabase workspace.

/** Largest CSV upload, in megabytes. */
export const UPLOAD_MAX_MB = 10;
/** How long a download's object URL is kept before it is released, so the browser has time to start the download. */
export const DOWNLOAD_URL_LIFETIME_MS = 60_000;

/**
 * saved: files are kept in IndexedDB on this device. memory: the browser blocked IndexedDB, so files last until a refresh.
 * cloud: a signed-in, active account's files, kept in its private Supabase workspace.
 */
export type StorageMode = 'saved' | 'memory' | 'cloud';
export interface Workspace { storage: Storage; mode: StorageMode }

/** Opens the signed-in account's cloud workspace, after the database confirms the account is active. */
export async function openCloudWorkspace(userId: string): Promise<Workspace> {
  const supabase = await getSupabase();
  if (!supabase) throw httpError(503, UNAVAILABLE_FILES_MESSAGE);
  let active: boolean | null = null;
  try {
    const { data, error } = await supabase.rpc('is_active_account');
    if (!error) active = data === true;
  } catch { /* unreachable: reported below */ }
  if (active === null) throw httpError(503, UNAVAILABLE_FILES_MESSAGE);
  if (!active) throw httpError(403, INACTIVE_MESSAGE);
  return { storage: createCloudStorage(supabase, userId), mode: 'cloud' };
}

/**
 * Opens IndexedDB, or keeps files in memory when the browser won't open it (storage turned off, some private windows).
 * An upgrade blocked by another open tab is not that: it is reported, because memory would hide the person's saved files.
 */
export async function openWorkspace(name?: string): Promise<Workspace> {
  try {
    return { storage: await openBrowserStorage(name), mode: 'saved' };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === UPGRADE_BLOCKED_STATUS) throw error;
    return { storage: createMemoryStorage(), mode: 'memory' };
  }
}

/**
 * The file actions over the chosen workspace. The browser workspace opens on first use with the five samples seeded;
 * a cloud workspace starts empty. setWorkspace follows the account: a change drops the old file service and its cache.
 */
export function createApi(
  open: () => Promise<Workspace>,
  openCloud: (userId: string) => Promise<Workspace> = openCloudWorkspace,
  initial: WorkspaceChoice = isAuthConfigured() ? { kind: 'pending' } : { kind: 'browser' },
) {
  let choice = initial;
  let release = () => {};
  let settled = new Promise<void>((resolve) => { release = resolve; });
  if (choice.kind !== 'pending') release();
  let opening: Promise<{ workspace: Workspace; files: FileService }> | undefined;
  let generation = 0; // changes with every workspace switch

  function opened(): Promise<{ workspace: Workspace; files: FileService }> {
    if (choice.kind === 'pending') return settled.then(opened); // actions wait for the account
    if (choice.kind === 'unavailable') return Promise.reject(httpError(503, choice.message));
    const chosen = choice;
    const attempt: Promise<{ workspace: Workspace; files: FileService }> = (opening ??= (chosen.kind === 'cloud' ? openCloud(chosen.userId) : open())
      .then(async (workspace) => {
        if (workspace.mode !== 'cloud') await seedSampleFiles(workspace.storage, SAMPLE_FILES);
        return { workspace, files: createFileService(workspace.storage) };
      })
      .catch((error) => {
        if (opening === attempt) opening = undefined; // the next call tries again
        throw error;
      }));
    return attempt;
  }
  const files = async () => (await opened()).files;

  return {
    /** Switches workspace when the account's choice changes; the previous file service is dropped. */
    setWorkspace: (next: WorkspaceChoice) => {
      if (workspaceKey(next) === workspaceKey(choice)) return;
      if (next.kind === 'pending') settled = new Promise<void>((resolve) => { release = resolve; });
      else release();
      choice = next;
      opening = undefined;
      generation++;
    },
    /**
     * Changes whenever the workspace does. A loop that makes one call per file reads it before each call and stops when it
     * differs, because File IDs repeat across workspaces and a later call would act on a different file.
     */
    workspaceId: () => generation,
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
    /** source is what a converted file brings: its original and where each row came from. */
    upload: async (file: File, source?: UploadSource) => {
      if (file.size > UPLOAD_MAX_MB * 1024 * 1024) throw new Error(`This file is larger than the ${UPLOAD_MAX_MB} MB upload limit.`);
      const service = await files();
      return service.upload({ name: file.name, text: await file.text(), source });
    },
    /** replace: true only after the person confirmed replacing this input's existing result. */
    process: async (fileId: string, processor: ProcessorId, replace?: boolean) => {
      const outcome = await (await files()).process(replace ? { fileId, processor, replace: true } : { fileId, processor });
      // A refused re-run carries the existing result, so the app can ask before replacing it.
      if ('conflict' in outcome) throw Object.assign(new Error(outcome.conflict.message), { conflict: outcome.conflict });
      return outcome.file;
    },
    /** Confirms the columns and units of a file that Needs Mapping; profileName also saves them as a supplier profile. */
    confirmMapping: async (body: Parameters<FileService['confirmMapping']>[0]) => (await files()).confirmMapping(body),
    archive: async (ids: string[], archived: boolean) => (await files()).archive({ ids, archived }),
    generate: async (body: { partner: GeneratorPartner; rows: number; errorRows: number; files: number }) => (await files()).generate(body),
    compare: async (ids: string[]) => (await files()).compare(ids),
    /** Explains one calculated value of a result from its raw source cells. */
    explain: async (body: Parameters<FileService['explain']>[0]) => (await files()).explain(body),
    storageMode: async (): Promise<StorageMode> => (await opened()).workspace.mode,
    /** Clear my data (browser workspace only): deletes every file and result, then brings the five samples back. */
    clearData: async () => {
      const current = await opened();
      const { storage } = current.workspace;
      // Cloud files reach every device and can't be deleted until 18.1, so there is nothing to clear there.
      if (current.workspace.mode === 'cloud' || !('clear' in storage)) throw httpError(400, 'Clear my data only clears this browser.');
      await (storage as BrowserStorage).clear();
      await seedSampleFiles(current.workspace.storage, SAMPLE_FILES);
      current.files = createFileService(current.workspace.storage); // starts with an empty parsed-file cache
    },
  };
}

export const api = createApi(() => openWorkspace());
