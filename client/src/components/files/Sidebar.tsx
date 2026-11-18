import { useRef, useState, type DragEvent } from 'react';
import { CloudUpload, Play, Trash2 } from 'lucide-react';
import { PROCESSORS, type ProcessorId } from '../../../../shared/types';
import type { StorageMode } from '../../lib/api';
import { classNames } from '../../lib/class-names';
import { Button } from '../ui/Button';
import styles from './files.module.scss';

type SelectedInput = { id: string; name: string };
const describe = (file: SelectedInput) => `${file.id} · ${file.name}`;

/** A mouse or trackpad can drag files in; a touch screen can't, so it only gets the button. */
const CAN_DRAG_FILES = '(pointer: fine)';

/**
 * The upload drop zone: drop CSV, Excel, PDF or image files on it, or browse for them. reading is the status
 * line while a file is converted, with Cancel (onCancelReading) beside it; screen readers hear each update.
 * disabled (while Clear my data runs) disables the buttons and ignores dropped files.
 */
function DropZone({ uploading, reading, disabled, onUpload, onCancelReading }: {
  uploading: boolean; reading?: string; disabled: boolean; onUpload: (files: File[]) => void; onCancelReading?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const upload = (list: FileList | null) => !disabled && list?.length && onUpload([...list]);
  const canDrag = window.matchMedia(CAN_DRAG_FILES).matches;
  const browse = () => input.current?.click();

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    upload(e.dataTransfer.files);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
      className={classNames(styles.dropZone, isDragOver && styles.dropZoneActive)}
    >
      <CloudUpload className={styles.dropIcon} strokeWidth={1.5} aria-hidden />
      {canDrag ? (
        <p className={styles.dropText}>
          Drop CSV, Excel, PDF or image files here
          <br />
          or{' '}
          <Button variant="link" disabled={disabled} onClick={browse}>browse files</Button>
        </p>
      ) : (
        <Button variant="secondary" className={styles.chooseFiles} disabled={disabled} onClick={browse}>Choose CSV, Excel, PDF or image files</Button>
      )}
      <div aria-live="polite" className={styles.uploading}>
        {reading ? (
          <p>
            {reading}{' '}
            {onCancelReading && <Button variant="link" onClick={onCancelReading}>Cancel</Button>}
          </p>
        ) : uploading && <p>Uploading…</p>}
      </div>
      <input ref={input} type="file" accept=".csv,text/csv,.xlsx,.xls,.pdf,application/pdf,.png,.jpg,.jpeg,image/png,image/jpeg" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

/** "Input: 101010 · name.csv", "Input: 3 files selected", or a hint to check files. */
function SelectedInputSummary({ selected }: { selected: SelectedInput[] }) {
  const count = selected.length;
  if (count === 0) return <>Check one or more input files in the list</>;
  if (count === 1) {
    return <>Input: <span className={styles.inputId}>{selected[0].id}</span> · <span className={styles.inputName}>{selected[0].name}</span></>;
  }
  return <>Input: <span className={styles.inputName}>{count} files selected</span></>;
}

interface SidebarProps {
  processor: ProcessorId;
  setProcessor: (processor: ProcessorId) => void;
  onUpload: (files: File[]) => void;
  onRun: () => void;
  canRun: boolean;
  running: boolean;
  uploading: boolean;
  reading?: string; // the status line while a file is converted before upload
  onCancelReading?: () => void; // ends that conversion; nothing is uploaded
  uploadDisabled: boolean; // true while Clear my data runs
  selected: SelectedInput[]; // the checked inputs, File ID and filename shown separately
  storageMode?: StorageMode; // where files are kept; unknown until storage has opened
  onClearData: () => void;
  clearDisabled: boolean;
}

const STORAGE_NOTES: Record<StorageMode, string> = {
  saved: 'Files are kept only in this browser. Clearing your browser data removes them.',
  memory: "This browser isn't saving files. They'll be gone when you refresh or close this page.",
};

/** The left column: upload, where files are kept, the processing function, the selected inputs and Run Processing. */
export function Sidebar({ processor, setProcessor, onUpload, onRun, canRun, running, uploading, reading, onCancelReading, uploadDisabled, selected, storageMode, onClearData, clearDisabled }: SidebarProps) {
  const count = selected.length;
  const runLabel = running ? 'Processing…' : `Run Processing${count > 1 ? ` (${count})` : ''}`;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.storage}>
        <DropZone uploading={uploading} reading={reading} disabled={uploadDisabled} onUpload={onUpload} onCancelReading={onCancelReading} />
        {storageMode && <p className={styles.storageNote}>{STORAGE_NOTES[storageMode]}</p>}
        <Button variant="secondary" className={styles.clearData} disabled={clearDisabled} onClick={onClearData} icon={<Trash2 />}>
          Clear my data
        </Button>
      </div>

      <section>
        <h2 className={styles.sectionTitle}>Processing Function</h2>
        <div className={styles.processorList}>
          {PROCESSORS.map((option) => {
            const isChosen = option.id === processor;
            return (
              <label key={option.id} className={classNames(styles.processorOption, isChosen && styles.processorOptionSelected)}>
                <input type="radio" name="processor" className={styles.processorRadio} checked={isChosen} onChange={() => setProcessor(option.id)} />
                <span>
                  <span className={styles.processorName}>{option.label}</span>
                  <span className={styles.processorDescription}>{option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <div>
        <p className={styles.selectedSummary} title={selected.map(describe).join(', ')}>
          <SelectedInputSummary selected={selected} />
        </p>
        {count > 1 && (
          <ul aria-label="Selected input files" className={styles.selectedInputs}>
            {selected.map((file) => <li key={file.id} className={styles.selectedInput}>{describe(file)}</li>)}
          </ul>
        )}
        <Button variant="success" size="lg" className={styles.runButton} disabled={!canRun} loading={running} onClick={onRun} icon={<Play />}>
          {runLabel}
        </Button>
      </div>
    </aside>
  );
}
