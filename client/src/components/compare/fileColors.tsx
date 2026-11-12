/** One colour per compared file, in order. A file keeps its colour in every chip, chart and table. */
export const FILE_COLORS = ['#2563eb', '#f59e0b', '#16a34a', '#9333ea', '#ec4899'];

/** A small dot in a file's colour, used beside its name. */
export const Dot = ({ k, size = 'h-2.5 w-2.5' }: { k: number; size?: string }) =>
  <span className={`inline-block shrink-0 rounded-full ${size}`} style={{ background: FILE_COLORS[k] }} aria-hidden />;
