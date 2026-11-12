import { ArrowLeft, Wand2 } from 'lucide-react';
import { ArchitectureSection } from '../components/architecture/ArchitectureSection';
import { SECTIONS } from '../components/architecture/content';
import { DecisionsSection } from '../components/architecture/DecisionsSection';
import { EvolutionSection } from '../components/architecture/EvolutionSection';
import { OverviewSection } from '../components/architecture/OverviewSection';
import { StorageSection } from '../components/architecture/StorageSection';
import { TechStackSection } from '../components/architecture/TechStackSection';
import styles from './ArchitecturePage.module.css';

/*
 * Architecture & Tech Stack page (/architecture), for walking through the design in an interview.
 * Each section lives in components/architecture/; the text they show is in content.ts there.
 */
export function ArchitecturePage() {
  return (
    <div className="page-shell px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Pages" className="page-nav">
          <a href="/" className="nav-link"><ArrowLeft className="h-4 w-4" /> Back to CSV Files</a>
          <a href="/generator" className="nav-link"><Wand2 className="h-4 w-4" /> CSV Generator</a>
        </nav>

        <header className="mt-6">
          <p className="eyebrow">Reclaim Studio · Engineering case study</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Architecture &amp; Tech Stack</h1>
          <p className={styles.intro}>Building a maintainable CSV processing application with a focused, type-safe technology stack.</p>
        </header>

        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={styles.sectionLink}>{label}</a>
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
