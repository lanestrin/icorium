import { FlaskConical } from 'lucide-react';
import { SCALE } from './content';
import { Section } from './Section';
import styles from './architecture.module.scss';

/** Section 6: the working demo beside recommendations for a larger product. */
export function EvolutionSection() {
  return (
    <Section id="evolve" eyebrow="6 · How it can scale" title="Future evolution"
      intro="Add services only when volume, accuracy or collaboration requirements justify them.">
      <table className={styles.scaleTable}>
        <caption>Today and at scale</caption>
        <thead><tr><th scope="col">Layer</th><th scope="col">Today</th><th scope="col">At scale<br /><span className={styles.recommendation}>{SCALE.status}</span></th></tr></thead>
        <tbody>{SCALE.rows.map((row) => (
          <tr key={row.layer}><th scope="row">{row.layer}</th><td>{row.today}</td><td>{row.future}</td></tr>
        ))}</tbody>
      </table>
      <p className={styles.testedNote}>
        <FlaskConical aria-hidden /> Repository paths and installed packages named on this page are checked by an automated test; recommendations are not installed services.
      </p>
    </Section>
  );
}
