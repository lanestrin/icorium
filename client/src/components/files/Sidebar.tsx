import { useRef, useState, type DragEvent } from 'react';
import { CloudUpload, LoaderCircle, Play } from 'lucide-react';
import { PROCESSORS, type ProcessorId } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import styles from './files.module.css';

type SelectedInput = { id: string; name: string };
const describe = (file: SelectedInput) => `${file.id} · ${file.name}`;

/** The upload drop zone: drop CSV files on it, or browse for them. */
function DropZone({ uploading, onUpload }: { uploading: boolean; onUpload: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const upload = (list: FileList | null) => list?.length && onUpload([...list]);

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
      <CloudUpload className="mx-auto mb-2 h-9 w-9 text-slate-600" strokeWidth={1.5} />
      <p className="text-slate-700">
        Drop CSV files here
        <br />
        or{' '}
        <button className={styles.browseButton} onClick={() => input.current?.click()}>browse files</button>
      </p>
      {uploading && <p className="mt-2 text-xs text-slate-500">Uploading…</p>}
      <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

/** "Input: 101010 · name.csv", "Input: 3 files selected", or a hint to check files. */
function SelectedInputSummary({ selected }: { selected: SelectedInput[] }) {
  const count = selected.length;
  if (count === 0) return <>Check one or more input files in the list</>;
  if (count === 1) {
    return <>Input: <span className="font-medium tabular-nums text-slate-700">{selected[0].id}</span> · <span className="font-medium text-slate-700">{selected[0].name}</span></>;
  }
  return <>Input: <span className="font-medium text-slate-700">{count} files selected</span></>;
}

interface SidebarProps {
  processor: ProcessorId;
  setProcessor: (processor: ProcessorId) => void;
  onUpload: (files: File[]) => void;
  onRun: () => void;
  canRun: boolean;
  running: boolean;
  uploading: boolean;
  selected: SelectedInput[]; // the checked inputs, File ID and filename shown separately
}

/** The left column: upload, the processing function, the selected inputs and Run Processing. */
export function Sidebar({ processor, setProcessor, onUpload, onRun, canRun, running, uploading, selected }: SidebarProps) {
  const count = selected.length;
  const runLabel = running ? 'Processing…' : `Run Processing${count > 1 ? ` (${count})` : ''}`;

  return (
    <aside className={styles.sidebar}>
      <DropZone uploading={uploading} onUpload={onUpload} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Processing Function</h2>
        <div className="space-y-2">
          {PROCESSORS.map((option) => {
            const isChosen = option.id === processor;
            return (
              <label key={option.id} className={classNames(styles.processorOption, isChosen && styles.processorOptionSelected)}>
                <input type="radio" name="processor" className={styles.processorRadio} checked={isChosen} onChange={() => setProcessor(option.id)} />
                <span>
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-sm text-slate-500">{option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <div>
        <p className="mb-2 truncate text-sm text-slate-500" title={selected.map(describe).join(', ')}>
          <SelectedInputSummary selected={selected} />
        </p>
        {count > 1 && (
          <ul aria-label="Selected input files" className={styles.selectedInputs}>
            {selected.map((file) => <li key={file.id} className="break-all">{describe(file)}</li>)}
          </ul>
        )}
        <button disabled={!canRun} onClick={onRun} className={styles.runButton}>
          {running ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
          {runLabel}
        </button>
      </div>
    </aside>
  );
}
