import { useEffect, useRef, useState } from 'react';
import type { Explanation, FieldExplanation, MappingOrigin } from '../../../../shared/ingestion';
import { api } from '../../lib/api';
import { classNames } from '../../lib/class-names';
import { errorMessage } from '../../lib/format';
import { Button } from '../ui/Button';
import styles from './modals.module.scss';

const ORIGIN: Record<MappingOrigin, string> = {
  exact: 'exact partner column',
  normalized: 'matched by name',
  alias: 'matched by a known alias',
  profile: 'from a supplier profile',
  manual: 'chosen by a person',
};

const PROBLEM: Record<NonNullable<FieldExplanation['problem']>, string> = {
  missing: 'missing, so nothing was calculated from it (never treated as zero)',
  'not a number': 'not a number',
  'ambiguous separator': 'has an ambiguous decimal or thousands separator',
};

function Field({ field }: { field: FieldExplanation }) {
  const raw = field.raw === '' ? '(blank)' : field.raw;
  return (
    <li className={styles.explainField}>
      <span className={styles.explainLabel}>{field.label}</span>
      <span>Source column "{field.column}" ({ORIGIN[field.origin]})</span>
      {field.location && <span>Source location: {field.location}</span>}
      <span>Raw value: {raw}</span>
      {field.confirmed && (
        <span>
          Read as "{field.confirmed.asRead}" ({field.confirmed.reasons.join('; ')}); {field.confirmed.decision === 'keep' ? 'kept as read' : 'left blank'}
        </span>
      )}
      {field.unit !== undefined && (
        <span>
          Unit {field.unit}, factor {field.factor}
          {field.problem ? `: ${PROBLEM[field.problem]}` : `, value used ${field.normalized}`}
        </span>
      )}
    </li>
  );
}

function Details({ explanation: e }: { explanation: Explanation }) {
  const source = e.input.source;
  return (
    <>
      <p>
        {e.column} for row {e.row} is {e.value === '' ? 'blank' : e.value}. Calculated by {e.processor.label} (version {e.processor.version}) from
        file {e.input.fileId}{e.input.name ? ` (${e.input.name})` : ''}.
      </p>
      {source && <p className={styles.explainMuted}>Original file: {source.name} ({source.kind}{source.sheet ? `, sheet ${source.sheet}` : ''}).</p>}
      {e.rowStatus === 'excluded' && (
        <p>This row was excluded from calculations{e.reasons ? `: ${e.reasons}` : ''}. No value was calculated from it, and it was never set to zero.</p>
      )}
      <ul className={styles.explainFields} aria-label="Source cells">
        {e.fields.map((f) => <Field key={f.field} field={f} />)}
      </ul>
    </>
  );
}

/**
 * How one calculated value of a result was worked out from its raw source cells. Loads the explanation when it opens;
 * focus moves to its heading, and the person who opened it gets focus back through onClose.
 */
export function ExplainPanel({ fileId, row, column, onClose }: { fileId: string; row: number; column: string; onClose: () => void }) {
  const [explanation, setExplanation] = useState<Explanation | { traced: false; reason: string }>();
  const [error, setError] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    let current = true; // a later cell, or closing, ignores this answer
    api.explain({ fileId, row, column })
      .then((answer) => { if (current) setExplanation(answer); })
      .catch((e) => { if (current) setError(errorMessage(e)); });
    return () => { current = false; };
  }, [fileId, row, column]);

  return (
    <section className={styles.explain} aria-labelledby="explain-title">
      <div className={styles.explainHead}>
        <h3 id="explain-title" ref={heading} tabIndex={-1} className={styles.explainTitle}>How this value was calculated</h3>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>
      {error && <p role="alert" className={classNames(styles.message, styles.error)}>{error}</p>}
      {!explanation && !error && <p role="status" className={styles.explainMuted}>Loading…</p>}
      {explanation && (explanation.traced ? <Details explanation={explanation} /> : <p>{explanation.reason}</p>)}
    </section>
  );
}
