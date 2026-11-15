import { ArrowDown, ArrowUp, FileSpreadsheet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FileMeta } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { displayStatus, importedLineage, processingFunction, type SortKey } from '../../lib/file-status';
import { RowMenu } from './RowMenu';
import { StatusBadge } from './StatusBadge';
import styles from './files.module.scss';

/** The table columns a sort can be on: each SortKey starts with one of these. */
type SortColumn = 'id' | 'name' | 'uploaded' | 'archived';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** A sortable column header: shows an arrow and sets aria-sort when the list is sorted by this column. */
function SortableHeader({ label, column, sort, className }: { label: string; column: SortColumn; sort: SortKey; className?: string }) {
  const isSorted = sort.startsWith(column);
  const isDescending = sort.endsWith('desc');
  const Arrow = isDescending ? ArrowDown : ArrowUp;
  return (
    <th className={className} aria-sort={isSorted ? (isDescending ? 'descending' : 'ascending') : undefined}>
      <span className={styles.headerLabel}>{label}{isSorted && <Arrow aria-hidden />}</span>
    </th>
  );
}

interface FileTableProps {
  files: FileMeta[];
  selectedIds: Set<string>;
  processingId?: string;
  failedIds: Set<string>;
  locked: boolean; // true while a batch runs
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  onPreview: (file: FileMeta) => void;
  archived?: boolean; // Archived tab: Archived On / Original Upload columns and Restore in the row menu
  onRestore?: (file: FileMeta) => void;
  restoreDisabled?: boolean;
  selectionBar?: ReactNode; // shown at the top of the card while rows are selected
  sort: SortKey;
  emptyMessage?: string;
}

/** The file list: a checkbox, File ID, name, dates, function, status and actions for every file. */
export function FileTable({ files, selectedIds, processingId, failedIds, locked, onToggle, onToggleAll, onPreview, archived, onRestore, restoreDisabled, selectionBar, sort, emptyMessage }: FileTableProps) {
  // Every file can be selected for archiving; Run Processing uses only the selected inputs.
  const ids = files.map((f) => f.id);
  const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
  const allChecked = ids.length > 0 && checkedCount === ids.length;
  const columnCount = archived ? 8 : 7; // for the empty-state row
  const canSelect = !locked;

  return (
    <div className={styles.tableCard}>
      {selectionBar}
      {/* A labelled, focusable region lets keyboard users scroll the list too. */}
      <div role="region" aria-label="CSV files" tabIndex={0} className={styles.scrollArea}>
        <table className={classNames(styles.table, archived && styles.tableArchived)}>
          <thead>
            <tr className={styles.headRow}>
              <th className={styles.checkboxHead}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  aria-label="Select all files"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && !allChecked; }}
                  disabled={locked || !ids.length}
                  onChange={() => onToggleAll(ids, !allChecked)}
                />
              </th>
              <SortableHeader label="File ID" column="id" sort={sort} className={styles.idColumn} />
              <SortableHeader label="File Name" column="name" sort={sort} />
              {archived ? (
                <>
                  <SortableHeader label="Archived On" column="archived" sort={sort} className={classNames(styles.leadDate, styles.gapRight)} />
                  <SortableHeader label="Original Upload" column="uploaded" sort={sort} className={styles.gapRight} />
                </>
              ) : (
                <SortableHeader label="Uploaded" column="uploaded" sort={sort} className={classNames(styles.leadDate, styles.gapRight)} />
              )}
              <th className={styles.gapRight}>Processing function</th>
              <th>Status</th>
              <th className={styles.actionsHead}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const isChecked = selectedIds.has(file.id);
              return (
                <tr
                  key={file.id}
                  onClick={() => canSelect && onToggle(file.id)}
                  className={classNames(styles.row, canSelect && styles.rowSelectable, isChecked && styles.rowChecked)}
                >
                  <td className={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      aria-label={`Select ${file.id} ${file.name}`}
                      checked={isChecked}
                      disabled={!canSelect}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggle(file.id)}
                    />
                  </td>
                  <td className={classNames(styles.idCell, styles.idColumn)}>
                    <span className={styles.idContent}>
                      {file.id}
                      {file.imported && <span title={importedLineage(file).note} className={styles.importedTag}>Imported</span>}
                    </span>
                  </td>
                  <td className={styles.nameCell}>
                    <span className={styles.nameContent}>
                      <FileSpreadsheet className={styles.fileIcon} strokeWidth={1.5} aria-hidden />
                      {file.name}
                    </span>
                  </td>
                  {archived && <td className={classNames(styles.nowrap, styles.leadDate, styles.gapRight)}>{file.archivedAt ? formatDate(file.archivedAt) : '—'}</td>}
                  <td className={classNames(styles.nowrap, styles.gapRight, !archived && styles.leadDate)}>{formatDate(file.uploadedAt)}</td>
                  <td className={classNames(styles.nowrap, styles.gapRight, styles.functionCell)}>{processingFunction(file)}</td>
                  <td>
                    <div className={classNames(styles.nowrap, styles.gapRight)}><StatusBadge status={displayStatus(file, processingId, failedIds)} /></div>
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      <RowMenu file={file} onPreview={() => onPreview(file)} onRestore={archived && onRestore ? () => onRestore(file) : undefined} disabled={restoreDisabled} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {!files.length && (
              <tr>
                <td colSpan={columnCount} className={styles.emptyRow}>{emptyMessage ?? 'No CSV files match your filters.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
