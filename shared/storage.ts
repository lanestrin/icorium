import type { FileMeta, ProcessorCode } from './types';

// Storage contract: what the app needs from wherever files are kept. The browser implements it with IndexedDB
// or memory in client/src/lib/browser-storage.ts; a cloud backend would be another Storage. Types only.

/** What saving a file needs; the ID and upload time are set by storage. */
export type NewFile = Omit<FileMeta, 'id' | 'uploadedAt'> & { text: string };
/** For create(): the text may depend on the new File ID, which is written into the CSV's ID columns. */
export type NewUpload = Omit<NewFile, 'text'> & { text: string | ((id: string) => string) };

/** What every storage provides. Files are keyed by File ID. */
export interface Storage {
  /** Every file's metadata, oldest upload first. */
  list(): Promise<FileMeta[]>;
  /** One file's metadata; 404 when there is none, or when the ID is not a File ID. */
  get(id: string): Promise<FileMeta>;
  /** One file's CSV text. */
  read(id: string): Promise<string>;
  /** Updates stored metadata fields of one file. */
  patch(id: string, fields: Partial<Omit<FileMeta, 'id'>>): Promise<FileMeta>;
  /** Saves a new upload under the next base ID (101010), or that ID plus a function code for an uploaded result (101010-M). */
  create(input: NewUpload, code?: ProcessorCode): Promise<FileMeta>;
  /** Saves a file under exactly this ID, replacing any file already there (a re-run result keeps its ID). */
  put(id: string, input: NewFile): Promise<FileMeta>;
  /** Saves a file under exactly this ID only if no file has it yet; undefined, changing nothing, when one does. */
  createAt(id: string, input: NewFile): Promise<FileMeta | undefined>;
  /** Saves a sample under its fixed ID unless that ID is already taken. */
  seed(id: string, input: NewFile): Promise<void>;
}
