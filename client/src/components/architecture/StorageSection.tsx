import { ArrowRight, Cloud, Laptop } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { Card } from '../ui/Card';
import { STORAGE_OPTIONS } from './content';
import { Checks, Path, Section } from './Section';
import styles from './architecture.module.scss';

type StorageOption = (typeof STORAGE_OPTIONS)[number];

/** One storage backend: the default is highlighted, and one not built yet is dashed and grey. */
function StorageOptionBox({ option, isDefault }: { option: StorageOption; isDefault: boolean }) {
  const look = isDefault ? styles.storageOptionDefault : !option.built && styles.storageOptionPlanned;
  return (
    <div className={classNames(styles.storageOption, look)}>
      <option.icon className={classNames(styles.storageIcon, !option.built && styles.storageIconPlanned)} aria-hidden />
      <span className={classNames(styles.storageOptionName, option.built && styles.storageOptionBuilt)}>{option.name}</span>
      <span className={styles.storageOptionNote}>{option.note}</span>
    </div>
  );
}

/** The backends in order, joined by arrows, with the interface they all provide. */
function StorageOptions() {
  return (
    <div className={styles.storageOptions}>
      <h3 className={styles.storageHeading}>Storage options</h3>
      <div role="img" className={styles.storageRow}
        aria-label="Storage options: the local filesystem (the default) and private Vercel Blob are built; S3 or Cloudflare R2 could be added as another backend behind the same interface.">
        {STORAGE_OPTIONS.map((option, i) => (
          <div key={option.name} className={styles.storageStep}>
            {i > 0 && <ArrowRight className={styles.storageArrow} aria-hidden />}
            <StorageOptionBox option={option} isDefault={i === 0} />
          </div>
        ))}
      </div>
      <p className={styles.storageNote}>
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
        <Card as="article">
          <h3 className={styles.cardHeading}><Laptop className={styles.headingIcon} aria-hidden /> Local development</h3>
          <Checks label="Local development" items={[
            'Node.js API with filesystem storage',
            <>Originals, results and metadata under <Path>server/data</Path></>,
          ]} />
        </Card>
        <Card as="article">
          <h3 className={styles.cardHeading}><Cloud className={styles.headingIcon} aria-hidden /> Optional Vercel deployment</h3>
          <Checks label="Optional Vercel deployment" items={[
            'Separate frontend and API services',
            'Private Vercel Blob storage',
            'Test site: deploys main',
            <>Each release also ships as a deployable zip (<Path>scripts/build-release.mjs</Path>); Production host not chosen yet</>,
          ]} />
        </Card>
        <StorageOptions />
      </div>
    </Section>
  );
}
