import { ArrowDown, ArrowRight, Layers } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { HOW_IT_WORKS, PIPELINE } from './content';
import { Section } from './Section';
import styles from './architecture.module.css';

const [PERSON, ...STEPS] = PIPELINE;
const FIRST_ROW = STEPS.slice(0, 4);
const SECOND_ROW = STEPS.slice(4);

/** One component in the diagram, with an arrow to the next one. The last step (storage) is highlighted. */
function Step({ index }: { index: number }) {
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const endsRow = index % 4 === 3;
  return (
    <li className="relative">
      <div className={classNames(styles.step, isLast && styles.lastStep)}>
        <step.icon className="h-6 w-6 text-blue-600" aria-hidden />
        <span className="mt-2 font-semibold">{step.title}</span>
        {step.sub && <span className="text-sm text-slate-500">{step.sub}</span>}
      </div>
      {!endsRow && <ArrowRight aria-hidden className={styles.rightArrow} />}
      {!isLast && <ArrowDown aria-hidden className={styles.downArrow} />}
    </li>
  );
}

/** The line from the end of the first row down and back to the start of the second (wide screens only). */
function Turn() {
  return (
    <li aria-hidden className={styles.turn}>
      <div className={styles.turnLine}>
        <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-full w-full">
          <path d="M100 0 V10 H0 V20" stroke="#60a5fa" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </li>
  );
}

/** The diagram: the person, then two rows of four components joined by arrows. */
function Diagram() {
  return (
    <div className="card">
      <ol aria-label="Architecture diagram" className={styles.pipeline}>
        <li className="md:col-span-4">
          <div className={styles.person}>
            <PERSON.icon className="h-6 w-6 shrink-0 text-blue-600" aria-hidden />
            <span><span className="block font-semibold">{PERSON.title}</span><span className="text-sm text-slate-600">{PERSON.sub}</span></span>
          </div>
          <ArrowDown aria-hidden className={styles.personArrow} />
        </li>
        {FIRST_ROW.map((_, i) => <Step key={i} index={i} />)}
        <Turn />
        {SECOND_ROW.map((_, i) => <Step key={i + 4} index={i + 4} />)}
      </ol>
    </div>
  );
}

/** The same path in numbered words, beside the diagram. */
function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="card">
      <h3 id="how-it-works" className={styles.cardTitle}>
        <span className={styles.iconBadge}><Layers className="h-5 w-5 text-blue-600" aria-hidden /></span> How it works
      </h3>
      <ol className="mt-4 space-y-3 text-sm text-slate-700">
        {HOW_IT_WORKS.map((text, i) => (
          <li key={text} className="flex gap-3">
            <span aria-hidden className={styles.stepNumber}>{i + 1}</span>
            <span className="pt-0.5">{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Section 3: the diagram of how data moves, with the same path in words. */
export function ArchitectureSection() {
  return (
    <Section id="architecture" eyebrow="3 · Architecture" title="How data moves through the app">
      <div className={styles.diagramLayout}>
        <Diagram />
        <HowItWorks />
      </div>
    </Section>
  );
}
