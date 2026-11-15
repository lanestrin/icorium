import { useState } from 'react';
import { classNames } from '../../lib/class-names';
import { Card } from '../ui/Card';
import { TECH, type Tech } from './content';
import { Path, Section } from './Section';
import styles from './architecture.module.scss';

/** Why a technology is here, the trade-off accepted with it, and where the code uses it. */
function TechDetails({ tech }: { tech: Tech }) {
  return (
    <Card as="section" aria-label="Selected technology" aria-live="polite" className={styles.techDetails}>
      <div className={styles.techHeader}>
        <span className={styles.iconBadge}><tech.icon className={styles.headingIcon} aria-hidden /></span>
        <div className={styles.textColumn}>
          <h3 className={styles.itemTitle}>{tech.name}</h3>
          <p className={styles.techRole}>{tech.role}</p>
        </div>
      </div>
      <ul className={styles.reasons}>
        {tech.why.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      <p className={styles.tradeoff}><span className={styles.tradeoffLabel}>Trade-off: </span>{tech.tradeoff}</p>
      <p className={styles.techFiles}>{tech.files.map((file) => <Path key={file}>{file}</Path>)}</p>
    </Card>
  );
}

/** Section 2: one tile per technology; selecting a tile shows its details below. */
export function TechStackSection() {
  const [selectedName, setSelectedName] = useState(TECH[0].name);
  const selected = TECH.find((t) => t.name === selectedName)!;

  return (
    <Section id="stack" eyebrow="2 · Technology stack" title="The tools and their purpose" side
      intro="Every tile is a dependency the code actually uses. Select one to see why it is here and the trade-off accepted with it.">
      <div role="group" aria-label="Technology stack" className={styles.techGrid}>
        {TECH.map((tech) => (
          <button key={tech.name} type="button" aria-pressed={tech === selected} aria-label={`${tech.name}, ${tech.role}`}
            onClick={() => setSelectedName(tech.name)}
            className={classNames(styles.techTile, tech === selected && styles.techTileSelected)}>
            <tech.icon className={styles.techIcon} aria-hidden />
            <span className={styles.techLabel}>{tech.label}</span>
            <span className={styles.techTileRole}>{tech.role}</span>
          </button>
        ))}
      </div>
      <TechDetails tech={selected} />
    </Section>
  );
}
