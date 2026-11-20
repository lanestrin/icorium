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
        aria-label="Storage options: the browser's IndexedDB is in use; Supabase Storage is planned for signed-in users in 17.4; S3 or Cloudflare R2 could follow at scale, behind the same interface.">
        {STORAGE_OPTIONS.map((option, i) => (
          <div key={option.name} className={styles.storageStep}>
            {i > 0 && <ArrowRight className={styles.storageArrow} aria-hidden />}
            <StorageOptionBox option={option} isDefault={i === 0} />
          </div>
        ))}
      </div>
      <p className={styles.storageNote}>
        One interface (list · get · read · patch · create · createAt · put) in <Path>shared/storage.ts</Path>, so another backend changes nothing else.
      </p>
    </div>
  );
}

/** Section 5: local and Vercel hosting of the static site, and the storage backends behind one interface. */
export function StorageSection() {
  return (
    <Section id="storage" eyebrow="5 · Storage and deployment" title="Hosting and storage" side
      intro="Separate concerns, one storage interface. Processing never touches persistence directly; the browser opens IndexedDB, or memory when it is blocked.">
      <div className={styles.storageGrid}>
        <Card as="article">
          <h3 className={styles.cardHeading}><Laptop className={styles.headingIcon} aria-hidden /> Local development</h3>
          <Checks label="Local development" items={[
            'One Vite dev server; no API or database to start',
            <>Files kept in the browser by <Path>client/src/lib/browser-storage.ts</Path></>,
          ]} />
        </Card>
        <Card as="article">
          <h3 className={styles.cardHeading}><Cloud className={styles.headingIcon} aria-hidden /> Optional Vercel deployment</h3>
          <Checks label="Optional Vercel deployment" items={[
            'One static site, free on the Hobby plan',
            'No server or cloud storage: files stay in each visitor\'s browser',
            'Stays static with no functions when Supabase holds signed-in users\' files (planned, 17.4)',
            'Test site: deploys main',
            <>Each release also ships as a deployable zip (<Path>scripts/build-release.mjs</Path>); Production host not chosen yet</>,
          ]} />
        </Card>
        <StorageOptions />
      </div>
    </Section>
  );
}
