import { useState } from 'react';
import { TECH } from './content';
import { Section, Path, CARD } from './Section';

/** One tile per technology; selecting a tile shows why it is here, its trade-off and where it is used. */
function TechStack() {
  const [selected, setSelected] = useState(TECH[0].name);
  const tech = TECH.find((t) => t.name === selected)!;
  return (
    <>
      <div role="group" aria-label="Technology stack" className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
        {TECH.map((t) => (
          <button key={t.name} type="button" aria-pressed={selected === t.name} aria-label={`${t.name}, ${t.role}`} onClick={() => setSelected(t.name)}
            className={`flex min-w-0 flex-col items-center rounded-2xl border px-2 py-3 text-center shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
              ${selected === t.name ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
            <t.icon className="h-6 w-6 text-blue-600" aria-hidden />
            <span className="mt-2 text-sm font-semibold leading-tight">{t.label}</span>
            <span className="mt-0.5 text-xs text-slate-500">{t.role}</span>
          </button>
        ))}
      </div>
      <section aria-label="Selected technology" aria-live="polite" className={`${CARD} mt-4`}>
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-blue-50 p-2"><tech.icon className="h-5 w-5 text-blue-600" aria-hidden /></span>
          <div className="min-w-0">
            <h3 className="font-semibold">{tech.name}</h3>
            <p className="text-sm text-slate-500">{tech.role}</p>
          </div>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {tech.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><span className="font-semibold">Trade-off: </span>{tech.tradeoff}</p>
        <p className="mt-3 flex flex-wrap gap-1.5">{tech.files.map((f) => <Path key={f}>{f}</Path>)}</p>
      </section>
    </>
  );
}

/** Section 2: the technology tiles and the selected one's details. */
export function TechStackSection() {
  return (
    <Section id="stack" eyebrow="2 · Technology stack" title="The tools and their purpose" side
      intro="Every tile is a dependency the code actually uses. Select one to see why it is here and the trade-off accepted with it.">
      <TechStack />
    </Section>
  );
}
