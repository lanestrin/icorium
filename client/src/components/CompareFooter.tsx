import { useEffect, useState } from 'react';

const DESKTOP = '(min-width: 1024px)'; // Tailwind lg

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}
import { ArrowLeftRight, ChevronUp, Scale } from 'lucide-react';
import { PROCESSORS, type FileMeta } from '../../../shared/types';

/** Short dropdown label, e.g. "partner_a_baseline · Mass". Uses the source file when known, else the result's own name. */
function shortLabel(f: FileMeta, files: FileMeta[]) {
  const source = files.find((s) => s.id === f.sourceId)?.name ?? f.name.replace(/^result_/, '').replace(new RegExp(`_${f.processor}\\.csv$`, 'i'), '');
  const fn = PROCESSORS.find((p) => p.id === f.processor)?.short ?? '';
  return `${source.replace(/\.csv$/i, '')} · ${fn}`;
}

interface Props {
  files: FileMeta[];
  results: FileMeta[];
  a: string;
  b: string;
  setA: (id: string) => void;
  setB: (id: string) => void;
  onCompare: () => void;
}

const Title = () => (
  <>
    <Scale className="h-8 w-8 shrink-0 text-blue-600" strokeWidth={1.5} />
    <span className="text-xl font-semibold">Compare Files</span>
  </>
);

export function CompareFooter({ files, results, a, b, setA, setB, onCompare }: Props) {
  const [open, setOpen] = useState(false); // mobile only; always expanded on lg+
  const desktop = useIsDesktop();
  const fa = results.find((f) => f.id === a);
  const fb = results.find((f) => f.id === b);
  const reason =
    !fa || !fb ? 'Select two result files'
    : fa.id === fb.id ? 'Choose two different files'
    : fa.processor !== fb.processor ? 'Files come from different processing functions'
    : '';

  // File B only offers results from the same function as File A.
  const optionsB = fa ? results.filter((f) => f.processor === fa.processor && f.id !== fa.id) : results;
  const chooseA = (id: string) => {
    setA(id);
    const next = results.find((f) => f.id === id);
    if (next && fb && (fb.processor !== next.processor || fb.id === next.id)) setB('');
  };

  const pick = (label: string, value: string, set: (id: string) => void, options: FileMeta[]) => (
    <label className="flex items-center gap-3">
      <span className="w-12 shrink-0 font-semibold">{label}</span>
      <select
        value={value}
        onChange={(e) => set(e.target.value)}
        className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm outline-none focus:border-blue-400 lg:w-72"
      >
        <option value="">Select result file…</option>
        {options.map((f) => <option key={f.id} value={f.id} title={f.name}>{shortLabel(f, files)}</option>)}
      </select>
    </label>
  );

  return (
    <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur lg:px-6 lg:py-4">
      {/* Mobile toggle */}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 lg:hidden">
        <Title />
        <ChevronUp className={`ml-auto h-5 w-5 text-slate-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Slides up on mobile; always visible on desktop */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out lg:grid-rows-[1fr] ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        {/* inert while collapsed, so Tab can't reach controls that are out of sight */}
        <div className="overflow-hidden lg:overflow-visible" inert={!open && !desktop}>
          <div className="flex flex-col gap-3 pt-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-center lg:gap-8 lg:pt-0">
            <div className="hidden items-center gap-3 border-r border-slate-200 pr-8 lg:flex">
              <Title />
            </div>
            {pick('File A', a, chooseA, results)}
            {pick('File B', b, setB, optionsB)}
            <div className="flex flex-col">
              <button
                disabled={!!reason}
                title={reason || undefined}
                onClick={() => { onCompare(); setOpen(false); }}
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowLeftRight className="h-5 w-5" /> Compare Selected
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
