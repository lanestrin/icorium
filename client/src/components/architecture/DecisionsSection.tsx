import { Server, TriangleAlert } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { Card } from '../ui/Card';
import { DECISIONS, PROCESSING_LOCATION } from './content';
import { Checks, Section } from './Section';
import styles from './architecture.module.scss';

type Decision = (typeof DECISIONS)[number];

/** The first decision, shown in full: where processing runs, its benefits and its trade-off. */
function ProcessingLocation() {
  return (
    <Card as="article" aria-label={PROCESSING_LOCATION.title} className={styles.featuredDecision}>
      <div className={styles.decision}>
        <span className={styles.largeIconBadge}><Server className={styles.largeBadgeIcon} aria-hidden /></span>
        <div className={styles.textColumn}>
          <h3 className={styles.featuredTitle}>{PROCESSING_LOCATION.title}</h3>
          <p className={styles.decisionSummary}>{PROCESSING_LOCATION.text}</p>
        </div>
      </div>
      <div className={styles.benefits}><Checks label="Benefits" items={PROCESSING_LOCATION.benefits} /></div>
      <div className={styles.tradeoffBox}>
        <p className={styles.tradeoffTitle}>
          <TriangleAlert className={styles.tradeoffIcon} aria-hidden /> Trade-off: server dependency
        </p>
        <p className={styles.tradeoffText}>{PROCESSING_LOCATION.tradeoff}</p>
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
      <ProcessingLocation />
      <div className={styles.decisionGrid}>
        {DECISIONS.map((decision, i) => <DecisionCard key={decision.question} decision={decision} wide={i >= 3} />)}
      </div>
    </Section>
  );
}
