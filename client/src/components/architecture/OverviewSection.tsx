import { Scale } from 'lucide-react';
import { OVERVIEW } from './content';
import { Section } from './Section';

/** Section 1: what the system does, and the principle behind the design. */
export function OverviewSection() {
  return (
    <Section id="overview" eyebrow="1 · System overview" title="What the system does" side
      intro="Takes partner CSVs in different formats and turns them into consistent, validated, comparable results.">
      <ul aria-label="What the system does" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {OVERVIEW.map(([Icon, title, text]) => (
          <li key={title} className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm">
            <Icon className="h-7 w-7 text-blue-600" aria-hidden />
            <span className="mt-2 font-semibold">{title}</span>
            <span className="mt-1 text-sm text-slate-600">{text}</span>
          </li>
        ))}
      </ul>
      <blockquote className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <p className="flex items-start gap-3 text-lg font-semibold text-slate-900">
          <Scale className="mt-1 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
          Choose the simplest technology that meets the requirements, while keeping the system maintainable and extensible.
        </p>
        <p className="mt-2 pl-8 text-sm text-slate-600">No accounts, database, queues or extra services until a requirement calls for them. Each layer has one job, so it can be replaced without touching the others.</p>
      </blockquote>
    </Section>
  );
}
