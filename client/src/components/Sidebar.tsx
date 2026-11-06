import { useRef, useState } from 'react';
import { CloudUpload, LoaderCircle, Play } from 'lucide-react';
import { PROCESSORS, type ProcessorId } from '../../../shared/types';

interface Props {
  processor: ProcessorId;
  setProcessor: (p: ProcessorId) => void;
  onUpload: (files: File[]) => void;
  onRun: () => void;
  canRun: boolean;
  running: boolean;
  uploading: boolean;
  selectedName?: string;
}

export function Sidebar(p: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = (list: FileList | null) => list?.length && p.onUpload([...list]);

  return (
    <aside className="w-full shrink-0 space-y-8 lg:w-[22rem]">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${drag ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white/50'}`}
      >
        <CloudUpload className="mx-auto mb-2 h-9 w-9 text-slate-600" strokeWidth={1.5} />
        <p className="text-slate-700">
          Drop CSV files here
          <br />
          or{' '}
          <button className="font-semibold text-blue-600 hover:underline" onClick={() => input.current?.click()}>
            browse files
          </button>
        </p>
        {p.uploading && <p className="mt-2 text-xs text-slate-500">Uploading…</p>}
        <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Processing Function</h2>
        <div className="space-y-2">
          {PROCESSORS.map((f) => {
            const on = f.id === p.processor;
            return (
              <label
                key={f.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${on ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <input type="radio" name="processor" className="h-5 w-5 shrink-0 accent-blue-600" checked={on} onChange={() => p.setProcessor(f.id)} />
                <span>
                  <span className="block font-semibold">{f.label}</span>
                  <span className="block text-sm text-slate-500">{f.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <div>
        <p className="mb-2 truncate text-sm text-slate-500">
          {p.selectedName ? <>Input: <span className="font-medium text-slate-700">{p.selectedName}</span></> : 'Click an input file in the list to select it'}
        </p>
        <button
          disabled={!p.canRun}
          onClick={p.onRun}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {p.running ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
          {p.running ? 'Processing…' : 'Run Processing'}
        </button>
      </div>
    </aside>
  );
}
