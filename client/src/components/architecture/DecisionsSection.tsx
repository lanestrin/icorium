import { Server, TriangleAlert } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { DECISIONS, PROCESSING_LOCATION } from './content';
import { Checks, Section } from './Section';
import styles from './architecture.module.css';

type Decision = (typeof DECISIONS)[number];

/** The first decision, shown in full: where processing runs, its benefits and its trade-off. */
function ProcessingLocation() {
  return (
    <article aria-label={PROCESSING_LOCATION.title} className={classNames('card', styles.featuredDecision)}>
      <div className="flex gap-4">
        <span className={styles.largeIconBadge}><Server className="h-8 w-8 text-blue-600" aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{PROCESSING_LOCATION.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{PROCESSING_LOCATION.text}</p>
        </div>
      </div>
      <div className={styles.benefits}><Checks label="Benefits" items={PROCESSING_LOCATION.benefits} /></div>
      <div className={styles.tradeoffBox}>
        <p className="flex items-center gap-2 font-semibold">
          <TriangleAlert className="h-5 w-5 shrink-0 text-amber-600" aria-hidden /> Trade-off: server dependency
        </p>
        <p className="mt-1 text-sm">{PROCESSING_LOCATION.tradeoff}</p>
      </div>
    </article>
  );
}

/** One decision: its question and short answer, with the full reasoning one click away. */
function DecisionCard({ decision, wide }: { decision: Decision; wide: boolean }) {
  return (
    <article className={classNames('card', styles.decision, wide ? styles.decisionWide : styles.decisionNarrow)}>
      <span className={styles.largeIconBadge}><decision.icon className="h-6 w-6 text-blue-600" aria-hidden /></span>
      <div className="min-w-0">
        <h3 className="font-semibold">{decision.question}</h3>
        <p className="mt-1 text-sm text-slate-600">{decision.summary}</p>
        <details className="mt-2 text-sm">
          <summary className={styles.reasoningToggle}>The full reasoning</summary>
          <div className="mt-2 space-y-2 text-slate-700">{decision.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        </details>
      </div>
    </article>
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
