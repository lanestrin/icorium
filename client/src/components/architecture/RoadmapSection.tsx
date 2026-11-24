import { Cloud } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { Card } from '../ui/Card';
import { HOSTED_DESIGN, ROADMAP, type RoadmapStatus } from './content';
import { Path, Section } from './Section';
import styles from './architecture.module.scss';

const STATUS_STYLE: Record<RoadmapStatus, string> = {
  Done: styles.statusDone,
  Next: styles.statusNext,
  Planned: styles.statusPlanned,
};

/** One milestone: its goal, then each build-plan item with its status. */
function Milestone({ milestone }: { milestone: (typeof ROADMAP)[number] }) {
  const headingId = `roadmap-${milestone.milestone}`;
  return (
    <Card as="article" aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.itemTitle}>{milestone.milestone} · {milestone.title}</h3>
      <p className={styles.decisionSummary}>{milestone.goal}</p>
      <ol aria-label={`${milestone.milestone} items`} className={styles.roadmapList}>
        {milestone.items.map((item) => (
          <li key={item.id} className={styles.roadmapItem}>
            <p className={styles.roadmapItemTitle}>
              <span className={styles.roadmapId}>{item.id}</span> {item.title}
              <span className={classNames(styles.statusChip, STATUS_STYLE[item.status])}>{item.status}</span>
            </p>
            <p className={styles.roadmapText}>{item.text}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Section 6: the approved next milestones, and the hosted design they build on. */
export function RoadmapSection() {
  return (
    <Section id="roadmap" eyebrow="6 · Roadmap" title="What is planned next"
      intro="The approved next scope, built one reviewed item at a time. Everything not marked Done is planned, not shipped.">
      <div className={styles.roadmapGrid}>
        {ROADMAP.map((milestone) => <Milestone key={milestone.milestone} milestone={milestone} />)}
      </div>
      <Card as="article" aria-labelledby="hosted-design" className={styles.hostedDesign}>
        <h3 id="hosted-design" className={styles.cardHeading}><Cloud className={styles.headingIcon} aria-hidden /> Hosted design</h3>
        <p className={styles.storageHeading}>{HOSTED_DESIGN.status}</p>
        <dl className={styles.serviceList}>
          {HOSTED_DESIGN.services.map((row) => (
            <div key={row.role} className={styles.serviceRow}>
              <dt className={styles.serviceRole}>{row.role}</dt>
              <dd className={styles.roadmapText}>{row.service}</dd>
            </div>
          ))}
        </dl>
        <h4 className={styles.storageHeading}>Accepted free-plan limits</h4>
        <ul aria-label="Accepted free-plan limits" className={styles.reasons}>
          {HOSTED_DESIGN.limits.map((limit) => <li key={limit}>{limit}</li>)}
        </ul>
        <p className={styles.storageNote}>
          The database rules start in <Path>supabase/migrations/20261118000000_identity.sql</Path>. They are applied to a development project; formal hosted evidence is recorded in 17.7.
        </p>
      </Card>
    </Section>
  );
}
