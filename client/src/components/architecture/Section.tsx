import { Fragment, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import styles from './architecture.module.scss';

/**
 * A repository path, in code style. A line break is allowed after each "/" (<wbr> adds no characters, so the
 * text and what gets copied are unchanged), so a long path wraps at a folder instead of widening a phone screen.
 */
export function Path({ children }: { children: string }) {
  const parts = children.split('/');
  return (
    <code className={styles.codeChip}>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}{i < parts.length - 1 && <>/<wbr /></>}</Fragment>
      ))}
    </code>
  );
}

/** A short list with a green tick before each item. */
export function Checks({ label, items }: { label: string; items: ReactNode[] }) {
  return (
    <ul aria-label={label} className={styles.checkList}>
      {items.map((item, i) => (
        <li key={i} className={styles.checkItem}><Check className={styles.checkIcon} aria-hidden /><span>{item}</span></li>
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
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 id={`${id}-title`} className={styles.sectionTitle}>{title}</h2>
        {intro && <p className={styles.sectionIntro}>{intro}</p>}
      </div>
      <div className={side ? styles.sideBody : styles.sectionBody}>{children}</div>
    </section>
  );
}
