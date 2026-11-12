import { FlaskConical } from 'lucide-react';
import { EVOLVE } from './content';
import { Section } from './Section';

/** Section 6: what would be added as the product grows. */
export function EvolutionSection() {
  return (
    <Section id="evolve" eyebrow="6 · How it can scale" title="Future evolution" side
      intro="Planned enhancements, added only when a requirement calls for them.">
      <ul aria-label="Future evolution" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {EVOLVE.map((e) => (
          <li key={e.title} className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm">
            <e.icon className="h-7 w-7 text-blue-600" aria-hidden />
            <h3 className="mt-2 font-semibold">{e.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{e.text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 flex items-center gap-2 text-sm text-slate-500">
        <FlaskConical className="h-4 w-4" aria-hidden /> Every repository path and package named on this page is checked by an automated test.
      </p>
    </Section>
  );
}
