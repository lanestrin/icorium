import { TriangleAlert, type LucideIcon } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { Card } from '../ui/Card';
import { CONVERSION, DECISIONS, PROCESSING_LOCATION } from './content';
import { Checks, Section } from './Section';
import styles from './architecture.module.scss';

type Decision = (typeof DECISIONS)[number];

/** Content shared by the two featured architecture decisions. */
interface FeaturedDecisionContent {
  title: string; icon: LucideIcon; text: string; benefits: string[];
  tradeoffTitle: string; tradeoff: string; status?: string; recommendation?: string; next?: string;
}

function FeaturedDecision({ decision }: { decision: FeaturedDecisionContent }) {
  return (
    <Card as="article" aria-label={decision.title} className={styles.featuredDecision}>
      <div className={styles.decision}>
        <span className={styles.largeIconBadge}><decision.icon className={styles.largeBadgeIcon} aria-hidden /></span>
        <div className={styles.textColumn}>
          <h3 className={styles.featuredTitle}>{decision.title}</h3>
          <p className={styles.decisionSummary}>{decision.text}</p>
          {decision.status && <p className={styles.storageHeading}>{decision.status}</p>}
        </div>
      </div>
      <div className={styles.benefits}><Checks label="Benefits" items={decision.benefits} /></div>
      <div className={styles.tradeoffBox}>
        <p className={styles.tradeoffTitle}>
          <TriangleAlert className={styles.tradeoffIcon} aria-hidden /> Trade-off: {decision.tradeoffTitle}
        </p>
        <p className={styles.tradeoffText}>{decision.tradeoff}</p>
        {decision.next && <p className={styles.tradeoffText}><strong>{decision.recommendation}: </strong>{decision.next}</p>}
      </div>
    </Card>
  );
}

/** One decision: its question and short answer, with the full reasoning one click away. */
function DecisionCard({ decision, wide }: { decision: Decision; wide: boolean }) {
  return (
    <Card as="article" className={classNames(styles.decision, wide ? styles.decisionWide : styles.decisionNarrow)}>
      <span className={styles.largeIconBadge}><decision.icon className={styles.decisionIcon} aria-hidden /></span>
      <div className={styles.textColumn}>
        <h3 className={styles.itemTitle}>{decision.question}</h3>
        <p className={styles.decisionSummary}>{decision.summary}</p>
        <details className={styles.reasoning}>
          <summary className={styles.reasoningToggle}>The full reasoning</summary>
          <div className={styles.reasoningText}>{decision.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        </details>
      </div>
    </Card>
  );
}

/** Section 4: where processing runs, then the main decisions (three, then two, per row on large screens). */
export function DecisionsSection() {
  return (
    <Section id="decisions" eyebrow="4 · Design decisions and constraints" title="The main decisions">
      <div className={styles.featuredDecisions}>
        <FeaturedDecision decision={PROCESSING_LOCATION} />
        <FeaturedDecision decision={CONVERSION} />
      </div>
      <div className={styles.decisionGrid}>
        {DECISIONS.map((decision, i) => <DecisionCard key={decision.question} decision={decision} wide={i >= 3} />)}
      </div>
    </Section>
  );
}
