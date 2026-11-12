import { useState } from 'react';
import { classNames } from '../../lib/class-names';
import { TECH, type Tech } from './content';
import { Path, Section } from './Section';
import styles from './architecture.module.css';

/** Why a technology is here, the trade-off accepted with it, and where the code uses it. */
function TechDetails({ tech }: { tech: Tech }) {
  return (
    <section aria-label="Selected technology" aria-live="polite" className="card mt-4">
      <div className="flex items-start gap-3">
        <span className={styles.iconBadge}><tech.icon className="h-5 w-5 text-blue-600" aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="font-semibold">{tech.name}</h3>
          <p className="text-sm text-slate-500">{tech.role}</p>
        </div>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {tech.why.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
      <p className={styles.tradeoff}><span className="font-semibold">Trade-off: </span>{tech.tradeoff}</p>
      <p className="mt-3 flex flex-wrap gap-1.5">{tech.files.map((file) => <Path key={file}>{file}</Path>)}</p>
    </section>
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
            <tech.icon className="h-6 w-6 text-blue-600" aria-hidden />
            <span className="mt-2 text-sm font-semibold leading-tight">{tech.label}</span>
            <span className="mt-0.5 text-xs text-slate-500">{tech.role}</span>
          </button>
        ))}
      </div>
      <TechDetails tech={selected} />
    </Section>
  );
}
