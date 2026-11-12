import { TriangleAlert } from 'lucide-react';
import { PROCESSORS, type ProcessorId } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import type { QualityWarning, Replacement } from '../../lib/file-status';
import { rowsWord } from '../../lib/format';
import { Modal } from './Modal';
import styles from './modals.module.css';

const processorLabel = (id: ProcessorId) => PROCESSORS.find((p) => p.id === id)?.label ?? '';
const ARCHIVED_NOTE = 'Archived: replacing it returns it to Active Files.';

/** What Mass or Classification will do with files that have invalid rows; shared by both run confirmations. */
function QualityDetails({ warning }: { warning: QualityWarning }) {
  const others = warning.cleanCount;
  return (
    <>
      <div className={classNames(styles.notice, 'text-amber-900')}>
        <TriangleAlert className={classNames(styles.noticeIcon, 'text-amber-600')} aria-hidden />
        <p>Valid rows will be calculated. Invalid rows will remain in the output with error details and no calculated values.</p>
      </div>
      <ul aria-label="Files with invalid rows" className={styles.fileList}>
        {warning.affected.map((file) => (
          <li key={file.id} className={styles.warningItem}>
            <span className="block break-all font-semibold text-slate-900">{file.name}</span>
            <span className="text-slate-700">{rowsWord(file.valid, 'valid')} · </span>
            <span className="font-medium text-amber-800">{rowsWord(file.invalid, 'invalid')}</span>
          </li>
        ))}
      </ul>
      {others > 0 && (
        <p className={styles.note}>
          {others} other selected {others === 1 ? 'file has' : 'files have'} no invalid rows and will be processed normally.
        </p>
      )}
    </>
  );
}

/** Cancel, and a confirm button that is green, or red when the action replaces results. */
function ConfirmButtons({ label, danger, onCancel, onConfirm }: { label: string; danger?: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className={styles.confirmButtons}>
      <button onClick={onCancel} className={styles.cancelButton}>Cancel</button>
      <button onClick={onConfirm} className={classNames(styles.confirmButton, danger ? styles.confirmDanger : styles.confirmSafe)}>{label}</button>
    </div>
  );
}

/** Asks before Mass or Classification calculates only the valid rows of files with invalid rows. */
export function QualityWarningModal({ warning, processor, onCancel, onConfirm }: {
  warning: QualityWarning; processor: ProcessorId; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal title="Data Quality Warning" subtitle={processorLabel(processor)} narrow onClose={onCancel}>
      <QualityDetails warning={warning} />
      <ConfirmButtons label="Process Valid Rows" onCancel={onCancel} onConfirm={onConfirm} />
    </Modal>
  );
}

/** The results a run would replace, one per line, noting any that are archived. */
function ReplacedResults({ items }: { items: Replacement[] }) {
  return (
    <ul aria-label="Results to replace" className={styles.fileList}>
      {items.map((item) => (
        <li key={item.resultId} className={styles.replaceItem}>
          <span className="font-semibold text-slate-900">{item.resultId}</span>
          <span className="block break-all text-slate-700">{item.resultName}</span>
          {item.archived && <span className="block text-slate-700">{ARCHIVED_NOTE}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Asks before a run replaces existing results (same input, same function, same File ID). When the Data
 * Quality Warning also applies, it is shown here too, so a run never needs two confirmations.
 */
export function ReplaceResultModal({ items, otherCount, warning, processor, onCancel, onConfirm }: {
  items: Replacement[]; otherCount: number; warning?: QualityWarning; processor: ProcessorId; onCancel: () => void; onConfirm: () => void;
}) {
  const label = processorLabel(processor);
  const [only] = items;
  const isSingle = items.length === 1;

  return (
    <Modal title="Replace existing result?" subtitle={label} narrow onClose={onCancel}>
      <div className={classNames(styles.notice, 'text-red-900')}>
        <TriangleAlert className={classNames(styles.noticeIcon, 'text-red-600')} aria-hidden />
        {isSingle ? (
          <div>
            <p>
              {label} has already been run for file <strong>{only.inputId}</strong>. Running it again will replace the
              existing result <strong>{only.resultId}</strong>. This action cannot be undone.
            </p>
            {only.archived && <p className="mt-2 text-sm text-slate-700">{ARCHIVED_NOTE}</p>}
          </div>
        ) : (
          <p>{label} has already been run for {items.length} selected files. Running it again will replace these existing results. This action cannot be undone.</p>
        )}
      </div>
      {!isSingle && <ReplacedResults items={items} />}
      {otherCount > 0 && (
        <p className={styles.note}>
          {otherCount} other selected {otherCount === 1 ? 'file' : 'files'} will be processed normally.
        </p>
      )}
      {warning && <QualityDetails warning={warning} />}
      <ConfirmButtons label="Run & Replace" danger onCancel={onCancel} onConfirm={onConfirm} />
    </Modal>
  );
}
