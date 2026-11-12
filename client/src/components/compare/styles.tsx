/** One colour per compared file, in order. A file keeps its colour in every chip, chart and table. */
export const FILE_COLORS = ['#2563eb', '#f59e0b', '#16a34a', '#9333ea', '#ec4899'];

/** A small dot in a file's colour, used beside its name. */
export const Dot = ({ k, size = 'h-2.5 w-2.5' }: { k: number; size?: string }) =>
  <span className={`inline-block shrink-0 rounded-full ${size}`} style={{ background: FILE_COLORS[k] }} aria-hidden />;

/** Card and pill-button styles shared by the comparison pieces. */
export const CARD = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5';
export const PILL = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-medium transition ${on ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;
