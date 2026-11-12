import { ArrowDown, ArrowRight, Layers } from 'lucide-react';
import { PIPELINE, HOW_IT_WORKS } from './content';
import { Section, CARD } from './Section';

/** Turns a pipeline row's right end down and back to the left start (wide screens only). */
const Turn = () => (
  <li aria-hidden className="relative hidden h-10 md:col-span-4 md:block">
    <div className="absolute inset-y-0 left-[calc((100%-6rem)/8)] right-[calc((100%-6rem)/8)]">
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-full w-full">
        <path d="M100 0 V10 H0 V20" stroke="#60a5fa" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  </li>
);

/** Static diagram: the person, then two rows of four components joined by arrows. */
function ArchitectureDiagram() {
  const [person, ...steps] = PIPELINE;
  const Step = ({ i }: { i: number }) => {
    const p = steps[i];
    const last = i === steps.length - 1;
    return (
      <li className="relative">
        <div className={`flex h-full flex-col items-center justify-center rounded-xl border px-2 py-4 text-center shadow-sm ${last ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}>
          <p.icon className="h-6 w-6 text-blue-600" aria-hidden />
          <span className="mt-2 font-semibold">{p.title}</span>
          {p.sub && <span className="text-sm text-slate-500">{p.sub}</span>}
        </div>
        {i % 4 !== 3 && <ArrowRight aria-hidden className="absolute -right-6.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-blue-500 md:block" />}
        {!last && <ArrowDown aria-hidden className="mx-auto my-1 h-5 w-5 text-blue-500 md:hidden" />}
      </li>
    );
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <div className={CARD}>
        <ol aria-label="Architecture diagram" className="grid md:grid-cols-4 md:gap-x-8">
          <li className="md:col-span-4">
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 md:w-[calc(50%-1rem)]">
              <person.icon className="h-6 w-6 shrink-0 text-blue-600" aria-hidden />
              <span><span className="block font-semibold">{person.title}</span><span className="text-sm text-slate-600">{person.sub}</span></span>
            </div>
            <ArrowDown aria-hidden className="mx-auto my-1 h-5 w-5 text-blue-500 md:mx-0 md:my-2 md:ml-[calc((100%-6rem)/8-0.625rem)]" />
          </li>
          {[0, 1, 2, 3].map((i) => <Step key={i} i={i} />)}
          <Turn />
          {[4, 5, 6, 7].map((i) => <Step key={i} i={i} />)}
        </ol>
      </div>
      <section aria-labelledby="how-it-works" className={CARD}>
        <h3 id="how-it-works" className="flex items-center gap-3 text-lg font-semibold">
          <span className="rounded-xl bg-blue-50 p-2"><Layers className="h-5 w-5 text-blue-600" aria-hidden /></span> How it works
        </h3>
        <ol className="mt-4 space-y-3 text-sm text-slate-700">
          {HOW_IT_WORKS.map((text, i) => (
            <li key={text} className="flex gap-3">
              <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{i + 1}</span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** Section 3: the diagram of how data moves, with the same path in words. */
export function ArchitectureSection() {
  return (
    <Section id="architecture" eyebrow="3 · Architecture" title="How data moves through the app">
      <ArchitectureDiagram />
    </Section>
  );
}
