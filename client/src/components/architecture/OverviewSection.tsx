import { Scale } from 'lucide-react';
import { OVERVIEW } from './content';
import { Section } from './Section';
import styles from './architecture.module.css';

/** Section 1: what the system does, and the principle behind the design. */
export function OverviewSection() {
  return (
    <Section id="overview" eyebrow="1 · System overview" title="What the system does" side
      intro="Takes partner CSVs in different formats and turns them into consistent, validated, comparable results.">
      <ul aria-label="What the system does" className={styles.overviewGrid}>
        {OVERVIEW.map(([Icon, title, text]) => (
          <li key={title} className={styles.tile}>
            <Icon className="h-7 w-7 text-blue-600" aria-hidden />
            <span className="mt-2 font-semibold">{title}</span>
            <span className="mt-1 text-sm text-slate-600">{text}</span>
          </li>
        ))}
      </ul>
      <blockquote className={styles.principle}>
        <p className={styles.principleStatement}>
          <Scale className="mt-1 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
          Choose the simplest technology that meets the requirements, while keeping the system maintainable and extensible.
        </p>
        <p className={styles.principleNote}>
          No accounts, database, queues or extra services until a requirement calls for them. Each layer has one job, so it can be replaced without touching the others.
        </p>
      </blockquote>
    </Section>
  );
}
