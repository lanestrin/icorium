import { ArchitectureSection } from '../components/architecture/ArchitectureSection';
import { SECTIONS } from '../components/architecture/content';
import { DecisionsSection } from '../components/architecture/DecisionsSection';
import { CustomersSecuritySection } from '../components/architecture/CustomersSecuritySection';
import { EvolutionSection } from '../components/architecture/EvolutionSection';
import { OverviewSection } from '../components/architecture/OverviewSection';
import { RoadmapSection } from '../components/architecture/RoadmapSection';
import { StorageSection } from '../components/architecture/StorageSection';
import { TechStackSection } from '../components/architecture/TechStackSection';
import sections from '../components/architecture/architecture.module.scss';
import styles from './ArchitecturePage.module.scss';
import { AppShell } from '../components/layout/AppShell';
import type { AccountApi } from '../components/layout/AccountMenu';

/*
 * Architecture & Tech Stack page (/architecture), for walking through the design in an interview.
 * Each section lives in components/architecture/; the text they show is in content.ts there.
 */
export function ArchitecturePage({ account }: { account: AccountApi }) {
  return (
    <AppShell account={account}>
    <div className={styles.page}>
      <div className={styles.content}>
        <header>
          <p className={sections.eyebrow}>Reclaim Studio · Engineering case study</p>
          <h1 className={styles.title}>Architecture &amp; Tech Stack</h1>
          <p className={styles.intro}>Building a maintainable CSV processing application with a focused, type-safe technology stack.</p>
        </header>

        <nav aria-label="On this page" className={styles.sectionNav}>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={styles.sectionLink}>{label}</a>
          ))}
        </nav>

        <OverviewSection />
        <TechStackSection />
        <ArchitectureSection />
        <DecisionsSection />
        <StorageSection />
        <RoadmapSection />
        <EvolutionSection />
        <CustomersSecuritySection />
      </div>
    </div>
    </AppShell>
  );
}
