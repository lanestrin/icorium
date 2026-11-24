import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { FileMeta } from '../../../../shared/types';
import { saveCsv } from '../../lib/api';
import { createBrowserExport } from '../../lib/browser-export';
import { UPGRADE_BLOCKED_STATUS } from '../../lib/browser-storage';
import { Banner } from '../Banner';
import { Button } from '../ui/Button';
import { Modal } from './Modal';
import styles from './modals.module.scss';

const READ_FAILED_MESSAGE = "Couldn't read the files kept in this browser. Try again.";

/** The message for a failed read: a blocked database upgrade explains itself, anything else is general. */
function failure(error: unknown): string {
  const known = error as { statusCode?: number; message?: string } | null;
  return known?.statusCode === UPGRADE_BLOCKED_STATUS && known.message ? known.message : READ_FAILED_MESSAGE;
}

/**
 * Lists the files kept in this browser before sign-in (17.5) so a person can save them, from the account menu or the sign-in page. They stay in
 * this browser: nothing is uploaded and nothing is deleted. The loaders can be replaced for tests.
 */
export function ExportBrowserFilesModal({ onClose, load, read, save = saveCsv }: {
  onClose: () => void;
  load?: () => Promise<FileMeta[]>;
  read?: (id: string) => Promise<{ name: string; text: string }>;
  save?: (file: { name: string; text: string }) => void;
}) {
  const [files, setFiles] = useState<FileMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0); // Try again bumps it, which reads the list again
  const source = useRef<ReturnType<typeof createBrowserExport> | null>(null);
  source.current ??= createBrowserExport(); // one database connection for the dialog's whole life
  const loadFiles = load ?? source.current.list;
  const readFile = read ?? source.current.read;
  const open = useRef(true); // false once the dialog closes, which stops a running Download all

  useEffect(() => {
    open.current = true;
    return () => { open.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadFiles().then(
      (list) => { if (!cancelled) setFiles(list); },
      (problem) => { if (!cancelled) setError(failure(problem)); },
    );
    return () => { cancelled = true; };
  }, [loadFiles, attempt]);

  /** Saves each file in turn; the first failure stops the rest and is reported. */
  async function download(ids: string[]) {
    setError(null);
    setBusy(true);
    try {
      for (const id of ids) {
        const file = await readFile(id);
        if (!open.current) return; // the dialog closed: send nothing more
        save(file);
      }
    } catch (problem) {
      setError(failure(problem));
    }
    if (open.current) setBusy(false);
  }

  return (
    <Modal title="Export this browser's files" subtitle="Files kept in this browser before sign-in was required" onClose={onClose}>
      <p>These files stay in this browser. They are not added to any account and nothing here is deleted. Download any you want to keep; once signed in, you can upload them to your workspace.</p>
      {error && <Banner tone="error">{error}</Banner>}
      {error && files === null && <Button variant="secondary" onClick={() => setAttempt((count) => count + 1)}>Try again</Button>}
      {files === null && !error && <p role="status">Looking for files in this browser…</p>}
      {files?.length === 0 && <p role="status">No files are kept in this browser.</p>}
      {files && files.length > 0 && (
        <>
          <ul aria-label="Files kept in this browser" className={styles.fileList}>
            {files.map((file) => (
              <li key={file.id} className={styles.exportItem}>
                <span>
                  <span className={styles.fileName}>{file.name}</span>
                  <span className={styles.secondaryText}>File ID {file.id} · {file.archived ? 'Archived' : 'Active'}</span>
                </span>
                <Button variant="secondary" size="sm" disabled={busy} icon={<Download />} aria-label={`Download ${file.name}, File ID ${file.id}`} onClick={() => void download([file.id])}>Download</Button>
              </li>
            ))}
          </ul>
          <div className={styles.confirmButtons}>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button loading={busy} icon={<Download />} onClick={() => void download(files.map((file) => file.id))}>Download all</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
