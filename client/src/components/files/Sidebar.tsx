import { useRef, useState, type DragEvent } from 'react';
import { CloudUpload, Play } from 'lucide-react';
import { PROCESSORS, type ProcessorId } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { Button } from '../ui/Button';
import styles from './files.module.scss';

type SelectedInput = { id: string; name: string };
const describe = (file: SelectedInput) => `${file.id} · ${file.name}`;

/** A mouse or trackpad can drag files in; a touch screen can't, so it only gets the button. */
const CAN_DRAG_FILES = '(pointer: fine)';

/** The upload drop zone: drop CSV or Excel files on it, or browse for them. reading names a file being converted. */
function DropZone({ uploading, reading, onUpload }: { uploading: boolean; reading?: string; onUpload: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const upload = (list: FileList | null) => list?.length && onUpload([...list]);
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
          Drop CSV or Excel files here
          <br />
          or{' '}
          <Button variant="link" onClick={browse}>browse files</Button>
        </p>
      ) : (
        <Button variant="secondary" className={styles.chooseFiles} onClick={browse}>Choose CSV or Excel files</Button>
      )}
      {reading ? <p className={styles.uploading}>Reading {reading}…</p> : uploading && <p className={styles.uploading}>Uploading…</p>}
      <input ref={input} type="file" accept=".csv,text/csv,.xlsx,.xls" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
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
  reading?: string; // a file being converted before upload
  selected: SelectedInput[]; // the checked inputs, File ID and filename shown separately
}

/** The left column: upload, the processing function, the selected inputs and Run Processing. */
export function Sidebar({ processor, setProcessor, onUpload, onRun, canRun, running, uploading, reading, selected }: SidebarProps) {
  const count = selected.length;
  const runLabel = running ? 'Processing…' : `Run Processing${count > 1 ? ` (${count})` : ''}`;

  return (
    <aside className={styles.sidebar}>
      <DropZone uploading={uploading} reading={reading} onUpload={onUpload} />

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
