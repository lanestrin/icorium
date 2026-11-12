import { ArrowLeft, Wand2 } from 'lucide-react';
import { ArchitectureSection } from '../components/architecture/ArchitectureSection';
import { SECTIONS } from '../components/architecture/content';
import { DecisionsSection } from '../components/architecture/DecisionsSection';
import { EvolutionSection } from '../components/architecture/EvolutionSection';
import { OverviewSection } from '../components/architecture/OverviewSection';
import { StorageSection } from '../components/architecture/StorageSection';
import { TechStackSection } from '../components/architecture/TechStackSection';

/*
 * Architecture & Tech Stack page (/architecture), for walking through the design in an interview.
 * Each section lives in components/architecture/; the text they show is in content.ts there.
 */
export function ArchitecturePage() {
  return (
    <div className="min-h-screen overflow-x-clip px-4 pb-16 pt-8 text-slate-900 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
          <a href="/" className="inline-flex items-center gap-2 text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to CSV Files</a>
          <a href="/generator" className="inline-flex items-center gap-2 text-blue-700 hover:underline"><Wand2 className="h-4 w-4" /> CSV Generator</a>
        </nav>

        <header className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Reclaim Studio · Engineering case study</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Architecture &amp; Tech Stack</h1>
          <p className="mt-3 max-w-3xl text-lg text-slate-700">Building a maintainable CSV processing application with a focused, type-safe technology stack.</p>
        </header>

        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700">{label}</a>
          ))}
        </nav>

        <OverviewSection />
        <TechStackSection />
        <ArchitectureSection />
        <DecisionsSection />
        <StorageSection />
        <EvolutionSection />
      </div>
    </div>
  );
}
