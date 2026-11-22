import { useEffect, useId, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { ADAPTER_FIELDS, FILE_ID_COLUMN, RESULT_ID_COLUMN, type FileMeta, type FileRows } from '../../../../shared/types';
import type { CanonicalField, MappingOrigin, MeasurementField, UnitDecision } from '../../../../shared/ingestion';
import { FIELD_LABELS } from '../../../../shared/mapping';
import { MEASUREMENT_FIELDS } from '../../../../shared/units';
import { api } from '../../lib/api';
import { classNames } from '../../lib/class-names';
import { errorMessage, rowsWord } from '../../lib/format';
import { Button } from '../ui/Button';
import { Modal } from './Modal';
import styles from './modals.module.scss';

/** The start of the file service's message when the mapping saved but the supplier profile did not. */
const PROFILE_PARTIAL = 'The mapping was saved, but';
/** Sample values shown per column, and the rows read to get them. */
const SAMPLES = 3;

const UNIT_CHOICES: Record<'mass' | 'composition', { value: string; label: string }[]> = {
  mass: [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }, { value: 'g', label: 'g' }],
  composition: [{ value: '%', label: 'percent (0–100)' }, { value: 'fraction', label: 'fraction (0–1)' }],
};

const MAPPING_ORIGIN: Record<MappingOrigin, string> = {
  exact: 'a partner column name',
  normalized: 'matches a partner column name',
  alias: 'a known alternative name',
  profile: 'from a supplier profile',
  manual: 'chosen earlier',
};
const UNIT_ORIGIN: Record<UnitDecision['origin'], string> = {
  partner: 'stated by the column name',
  header: 'stated by the column name',
  metadata: 'stated in the file',
  profile: 'from a supplier profile',
  confirmed: 'confirmed earlier',
};

/**
 * Confirms the columns and units of an input that Needs Mapping: which column holds each field and which unit
 * each measurement is in, with sample values, the stored warnings and why processing is blocked. The file
 * service checks every choice again; this dialog only guides. Cancel, Escape or closing saves nothing. A refusal
 * from the service is shown here and the choices stay. Header and cell text is rendered as text only.
 */
export function MappingDialog({ file, onClose, onConfirmed }: {
  file: FileMeta;
  onClose: () => void;
  onConfirmed: (outcome: { name: string; profileError?: string }) => void;
}) {
  const ingestion = file.ingestion;
  const ids = useId();
  const [data, setData] = useState<FileRows>();
  const [loadError, setLoadError] = useState<string>();
  // header → the field it holds ('' = Not used), and field → unit; both start from what the upload suggested.
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries((ingestion?.mappings ?? []).map((m) => [m.sourceColumn, m.field])));
  const [units, setUnits] = useState<Partial<Record<MeasurementField, string>>>(() => Object.fromEntries((ingestion?.units ?? []).map((u) => [u.field, u.unit])));
  const [profileName, setProfileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    api.rows(file.id, 0, SAMPLES).then((page) => { if (current) setData(page); }, (e) => { if (current) setLoadError(errorMessage(e)); });
    return () => { current = false; };
  }, [file.id]);

  const headers = (data?.headers ?? []).filter((h) => h !== FILE_ID_COLUMN && h !== RESULT_ID_COLUMN);
  const columnsFor = (field: CanonicalField) => headers.filter((h) => choice[h] === field);
  const missing = ADAPTER_FIELDS.filter((f) => columnsFor(f).length === 0);
  const doubled = ADAPTER_FIELDS.filter((f) => columnsFor(f).length > 1);
  const unitless = MEASUREMENT_FIELDS.filter((f) => !units[f]);
  const ready = !!data && !missing.length && !doubled.length && !unitless.length;
  const state = ready ? 'Ready to Confirm' : 'Needs Mapping';
  const blocked = [
    ...missing.map((f) => `Choose a column for ${FIELD_LABELS[f]}`),
    ...doubled.map((f) => `${FIELD_LABELS[f]} is chosen for two columns`),
    ...unitless.map((f) => `Confirm the unit for ${FIELD_LABELS[f]}`),
  ];
  const warnings = (ingestion?.issues ?? []).filter((i) => i.severity !== 'blocking');

  const suggestedField = (header: string) => ingestion?.mappings.find((m) => m.sourceColumn === header);
  const suggestedUnit = (field: MeasurementField) => ingestion?.units.find((u) => u.field === field);

  async function confirm() {
    setSubmitting(true);
    setError(undefined);
    const columns = Object.fromEntries(ADAPTER_FIELDS.map((f) => [f, columnsFor(f)[0]])) as Record<CanonicalField, string>;
    const name = profileName.trim();
    try {
      await api.confirmMapping({ fileId: file.id, columns, units, ...(name ? { profileName: name } : {}) });
      onConfirmed({ name: file.name });
    } catch (e) {
      const message = errorMessage(e);
      if (message.startsWith(PROFILE_PARTIAL)) onConfirmed({ name: file.name, profileError: message }); // the mapping did save
      else { setError(message); setSubmitting(false); }
    }
  }

  return (
    <Modal title={`Map columns: ${file.name}`} subtitle={`File ID ${file.id} · ${rowsWord(file.rows)} · ${state}`} onClose={onClose}>
      {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
      {!data && !loadError && <p className={styles.loading}>Loading columns…</p>}
      {data && (
        <>
          {!!blocked.length && (
            <section aria-label="Why processing is blocked" className={classNames(styles.problems, styles.pinned)}>
              <h3 className={styles.problemsTitle}><TriangleAlert aria-hidden /> Why processing is blocked</h3>
              <ul className={styles.problemList}>{blocked.map((why) => <li key={why}>{why}</li>)}</ul>
            </section>
          )}
          {ready && <p className={styles.note}>Processing stays blocked until you confirm this mapping.</p>}
          {!!warnings.length && (
            <section aria-label="Warnings" className={classNames(styles.problems, styles.pinned)}>
              <h3 className={styles.problemsTitle}><TriangleAlert aria-hidden /> Warnings</h3>
              <ul className={styles.problemList}>{warnings.map((w, i) => <li key={i}>{w.reason}</li>)}</ul>
            </section>
          )}

          <table className={styles.table}>
            <thead className={styles.tableHead}>
              <tr>
                <th className={styles.columnHead}>Column</th>
                <th className={styles.columnHead}>Sample values</th>
                <th className={styles.columnHead}>Holds</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h, i) => {
                const field = choice[h] as CanonicalField | '' | undefined;
                const suggested = suggestedField(h);
                const clash = !!field && doubled.includes(field);
                return (
                  <tr key={h} className={styles.row}>
                    <td className={styles.cell}>{h}</td>
                    <td className={styles.cell}>{data.rows.slice(0, SAMPLES).map((r) => r[h]).join(', ')}</td>
                    <td className={styles.cell}>
                      <select
                        className={classNames('menu-select', styles.mappingSelect)}
                        aria-label={`Field for column ${h}`}
                        aria-invalid={clash || undefined}
                        aria-describedby={clash ? `${ids}-clash-${i}` : undefined}
                        value={field ?? ''}
                        onChange={(e) => setChoice({ ...choice, [h]: e.target.value })}
                      >
                        <option value="">Not used</option>
                        {ADAPTER_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                      </select>
                      {field && <span className={styles.note}> {suggested?.field === field ? MAPPING_ORIGIN[suggested.origin] : 'chosen by you'}</span>}
                      {clash && <span id={`${ids}-clash-${i}`} className={styles.error}> {FIELD_LABELS[field]} is chosen for two columns</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <fieldset className={styles.mappingUnits}>
            <legend>Units</legend>
            {MEASUREMENT_FIELDS.map((f) => {
              const decided = suggestedUnit(f);
              const options = UNIT_CHOICES[f === 'massKg' ? 'mass' : 'composition'];
              return (
                <div key={f} className={styles.mappingUnitRow}>
                  <label htmlFor={`${ids}-unit-${f}`}>{FIELD_LABELS[f]} unit</label>
                  <select
                    id={`${ids}-unit-${f}`}
                    className={classNames('menu-select', styles.mappingSelect)}
                    value={units[f] ?? ''}
                    onChange={(e) => setUnits({ ...units, [f]: e.target.value })}
                  >
                    <option value="">Confirm the unit</option>
                    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {units[f] && <span className={styles.note}>{decided && decided.unit === units[f] ? UNIT_ORIGIN[decided.origin] : 'chosen by you'}</span>}
                </div>
              );
            })}
          </fieldset>

          <div className={styles.mappingUnitRow}>
            <label htmlFor={`${ids}-profile`}>Save as supplier profile (optional)</label>
            <input id={`${ids}-profile`} type="text" maxLength={80} value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          </div>
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </>
      )}
      <div className={classNames(styles.confirmButtons, styles.pinned)}>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="success" onClick={confirm} disabled={!ready || submitting}>Confirm mapping</Button>
      </div>
    </Modal>
  );
}
