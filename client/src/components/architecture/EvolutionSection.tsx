import { FlaskConical } from 'lucide-react';
import { EVOLVE } from './content';
import { Section } from './Section';
import styles from './architecture.module.scss';

/** Section 6: what would be added as the product grows. */
export function EvolutionSection() {
  return (
    <Section id="evolve" eyebrow="6 · How it can scale" title="Future evolution" side
      intro="Planned enhancements, added only when a requirement calls for them.">
      <ul aria-label="Future evolution" className={styles.evolutionGrid}>
        {EVOLVE.map((idea) => (
          <li key={idea.title} className={styles.tile}>
            <idea.icon className={styles.tileIcon} aria-hidden />
            <h3 className={styles.tileTitle}>{idea.title}</h3>
            <p className={styles.tileText}>{idea.text}</p>
          </li>
        ))}
      </ul>
      <p className={styles.testedNote}>
        <FlaskConical aria-hidden /> Every repository path and package named on this page is checked by an automated test.
      </p>
    </Section>
  );
}
