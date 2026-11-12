import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/** Card style shared by the Architecture page's sections. */
export const CARD = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const H2 = 'text-2xl font-bold tracking-tight';

/** A repository path, in code style. */
export const Path = ({ children }: { children: string }) => (
  <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">{children}</code>
);

/** A short list with a green tick before each item. */
export const Checks = ({ label, items }: { label: string; items: ReactNode[] }) => (
  <ul aria-label={label} className="mt-3 space-y-1.5 text-sm text-slate-700">
    {items.map((item, i) => (
      <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden /><span>{item}</span></li>
    ))}
  </ul>
);

/**
 * One numbered page section. With side, the heading sits left of the content on wide screens.
 * Every section but the first has a divider line above it.
 */
export function Section({ id, eyebrow, title, intro, side, children }: {
  id: string; eyebrow: string; title: string; intro?: string; side?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}
      className={`mt-12 scroll-mt-6 border-t border-slate-200 pt-12 first-of-type:mt-8 first-of-type:border-t-0 first-of-type:pt-0 ${side ? 'xl:grid xl:grid-cols-[16rem_minmax(0,1fr)] xl:items-start xl:gap-8' : ''}`}>
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">{eyebrow}</p>
        <h2 id={`${id}-title`} className={`${H2} mt-1`}>{title}</h2>
        {intro && <p className="mt-2 max-w-3xl text-slate-600">{intro}</p>}
      </div>
      <div className={side ? 'mt-6 min-w-0 xl:mt-0' : 'mt-6'}>{children}</div>
    </section>
  );
}
