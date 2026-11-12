import { ArrowRight, Cloud, Laptop } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { STORAGE_OPTIONS } from './content';
import { Checks, Path, Section } from './Section';
import styles from './architecture.module.css';

type StorageOption = (typeof STORAGE_OPTIONS)[number];

/** One storage backend: the default is highlighted, and one not built yet is dashed and grey. */
function StorageOptionBox({ option, isDefault }: { option: StorageOption; isDefault: boolean }) {
  const look = isDefault ? styles.storageOptionDefault : !option.built && styles.storageOptionPlanned;
  return (
    <div className={classNames(styles.storageOption, look)}>
      <option.icon className={`h-5 w-5 ${option.built ? 'text-blue-600' : 'text-slate-400'}`} aria-hidden />
      <span className={classNames(styles.storageOptionName, option.built && 'text-slate-800')}>{option.name}</span>
      <span className={styles.storageOptionNote}>{option.note}</span>
    </div>
  );
}

/** The backends in order, joined by arrows, with the interface they all provide. */
function StorageOptions() {
  return (
    <div className={styles.storageOptions}>
      <h3 className="text-sm font-semibold">Storage options</h3>
      <div role="img" className="mt-3 flex items-stretch gap-1"
        aria-label="Storage options: the local filesystem (the default) and private Vercel Blob are built; S3 or Cloudflare R2 could be added as another backend behind the same interface.">
        {STORAGE_OPTIONS.map((option, i) => (
          <div key={option.name} className="flex min-w-0 flex-1 items-center gap-1">
            {i > 0 && <ArrowRight className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />}
            <StorageOptionBox option={option} isDefault={i === 0} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        One interface (list · get · read · patch · create · createAt · put) in <Path>server/src/lib</Path>, so another backend changes nothing else.
      </p>
    </div>
  );
}

/** Section 5: local and Vercel hosting, and the storage backends behind one interface. */
export function StorageSection() {
  return (
    <Section id="storage" eyebrow="5 · Storage and deployment" title="Hosting and storage" side
      intro="Separate concerns, one storage interface. Routes and processing never touch persistence; the backend is chosen at startup.">
      <div className={styles.storageGrid}>
        <article className="card">
          <h3 className={styles.cardHeading}><Laptop className="h-5 w-5 text-blue-600" aria-hidden /> Local development</h3>
          <Checks label="Local development" items={[
            'Node.js API with filesystem storage',
            <>Originals, results and metadata under <Path>server/data</Path></>,
          ]} />
        </article>
        <article className="card">
          <h3 className={styles.cardHeading}><Cloud className="h-5 w-5 text-blue-600" aria-hidden /> Optional Vercel deployment</h3>
          <Checks label="Optional Vercel deployment" items={['Separate frontend and API services', 'Private Vercel Blob storage', 'Configured, not yet deployed']} />
        </article>
        <StorageOptions />
      </div>
    </Section>
  );
}
