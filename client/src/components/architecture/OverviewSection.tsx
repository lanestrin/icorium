import { Scale } from 'lucide-react';
import { OVERVIEW } from './content';
import { Section } from './Section';
import styles from './architecture.module.scss';

/** Section 1: what the system does, and the principle behind the design. */
export function OverviewSection() {
  return (
    <Section id="overview" eyebrow="1 · System overview" title="What the system does" side
      intro="Takes partner CSVs in different formats and turns them into consistent, validated, comparable results.">
      <ul aria-label="What the system does" className={styles.overviewGrid}>
        {OVERVIEW.map(([Icon, title, text]) => (
          <li key={title} className={styles.tile}>
            <Icon className={styles.tileIcon} aria-hidden />
            <span className={styles.tileTitle}>{title}</span>
            <span className={styles.tileText}>{text}</span>
          </li>
        ))}
      </ul>
      <blockquote className={styles.principle}>
        <p className={styles.principleStatement}>
          <Scale className={styles.principleIcon} aria-hidden />
          Choose the simplest technology that meets the requirements, while keeping the system maintainable and extensible.
        </p>
        <p className={styles.principleNote}>
          No accounts, database, queues or extra services until a requirement calls for them. Each layer has one job, so it can be replaced without touching the others.
        </p>
      </blockquote>
    </Section>
  );
}
