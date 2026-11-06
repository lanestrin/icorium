import { ArrowLeftRight, Scale } from 'lucide-react';
import type { FileMeta } from '../../../shared/types';

interface Props {
  results: FileMeta[];
  a: string;
  b: string;
  setA: (id: string) => void;
  setB: (id: string) => void;
  onCompare: () => void;
}

export function CompareFooter({ results, a, b, setA, setB, onCompare }: Props) {
  const fa = results.find((f) => f.id === a);
  const fb = results.find((f) => f.id === b);
  const reason =
    !fa || !fb ? 'Select two result files'
    : fa.id === fb.id ? 'Choose two different files'
    : fa.processor !== fb.processor ? 'Files come from different processing functions'
    : '';

  const pick = (label: string, value: string, set: (id: string) => void) => (
    <label className="flex items-center gap-3">
      <span className="font-semibold">{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)} className="w-72 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm outline-none focus:border-blue-400">
        <option value="">Select result file…</option>
        {results.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </label>
  );

  return (
    <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4 lg:gap-8">
        <div className="flex items-center gap-3 lg:border-r lg:border-slate-200 lg:pr-8">
          <Scale className="h-8 w-8 text-blue-600" strokeWidth={1.5} />
          <span className="text-xl font-semibold">Compare Files</span>
        </div>
        {pick('File A', a, setA)}
        {pick('File B', b, setB)}
        <div className="ml-auto flex items-center gap-3">
          {reason && <span className="text-sm text-slate-500">{reason}</span>}
          <button
            disabled={!!reason}
            onClick={onCompare}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeftRight className="h-5 w-5" /> Compare Selected
          </button>
        </div>
      </div>
    </footer>
  );
}
