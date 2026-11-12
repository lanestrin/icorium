import { Server, TriangleAlert } from 'lucide-react';
import { PROCESSING_LOCATION, DECISIONS } from './content';
import { Section, Checks, CARD } from './Section';

/** Section 4: where processing runs, then the main decisions with their full reasoning. */
export function DecisionsSection() {
  return (
    <Section id="decisions" eyebrow="4 · Design decisions and constraints" title="The main decisions">
      <article aria-label={PROCESSING_LOCATION.title}
        className={`${CARD} grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center`}>
        <div className="flex gap-4">
          <span className="h-fit rounded-2xl bg-blue-50 p-3"><Server className="h-8 w-8 text-blue-600" aria-hidden /></span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{PROCESSING_LOCATION.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{PROCESSING_LOCATION.text}</p>
          </div>
        </div>
        <div className="lg:border-l lg:border-slate-200 lg:pl-6"><Checks label="Benefits" items={PROCESSING_LOCATION.benefits} /></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden /> Trade-off: server dependency</p>
          <p className="mt-1 text-sm">{PROCESSING_LOCATION.tradeoff}</p>
        </div>
      </article>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        {DECISIONS.map((d, i) => (
          <article key={d.question} className={`${CARD} flex gap-4 ${i < 3 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            <span className="h-fit rounded-2xl bg-blue-50 p-3"><d.icon className="h-6 w-6 text-blue-600" aria-hidden /></span>
            <div className="min-w-0">
              <h3 className="font-semibold">{d.question}</h3>
              <p className="mt-1 text-sm text-slate-600">{d.summary}</p>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-medium text-blue-700 hover:underline">The full reasoning</summary>
                <div className="mt-2 space-y-2 text-slate-700">{d.answer.map((p) => <p key={p}>{p}</p>)}</div>
              </details>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
