import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import styles from './architecture.module.css';

/** A repository path, in code style. */
export const Path = ({ children }: { children: string }) => <code className="code-chip">{children}</code>;

/** A short list with a green tick before each item. */
export function Checks({ label, items }: { label: string; items: ReactNode[] }) {
  return (
    <ul aria-label={label} className={styles.checkList}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2"><Check className={styles.checkIcon} aria-hidden /><span>{item}</span></li>
      ))}
    </ul>
  );
}

/**
 * One numbered page section. With side, the heading sits left of the content on wide screens.
 * Every section but the first has a divider line above it.
 */
export function Section({ id, eyebrow, title, intro, side, children }: {
  id: string; eyebrow: string; title: string; intro?: string; side?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={classNames(styles.section, side && styles.sideBySide)}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`} className={styles.sectionTitle}>{title}</h2>
        {intro && <p className={styles.sectionIntro}>{intro}</p>}
      </div>
      <div className={side ? styles.sideBody : styles.sectionBody}>{children}</div>
    </section>
  );
}
