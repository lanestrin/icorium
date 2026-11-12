import { ArrowDown, ArrowUp, FileSpreadsheet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FileMeta } from '../../../../shared/types';
import { classNames } from '../../lib/class-names';
import { displayStatus, importedLineage, processingFunction, type SortKey } from '../../lib/file-status';
import { RowMenu } from './RowMenu';
import { StatusBadge } from './StatusBadge';
import styles from './files.module.css';

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
      <span className="inline-flex items-center gap-1">{label}{isSorted && <Arrow className="h-3.5 w-3.5" aria-hidden />}</span>
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
        <table className={classNames('w-full text-sm', archived ? 'min-w-[1160px]' : 'min-w-[1000px]')}>
          <thead>
            <tr className={styles.headRow}>
              <th className="w-14 rounded-l-xl pl-6">
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
              <SortableHeader label="File ID" column="id" sort={sort} className="pl-1 pr-4" />
              <SortableHeader label="File Name" column="name" sort={sort} />
              {archived ? (
                <>
                  <SortableHeader label="Archived On" column="archived" sort={sort} className="pl-4 pr-3" />
                  <SortableHeader label="Original Upload" column="uploaded" sort={sort} className="pr-3" />
                </>
              ) : (
                <SortableHeader label="Uploaded" column="uploaded" sort={sort} className="pl-4 pr-3" />
              )}
              <th className="pr-3">Processing function</th>
              <th>Status</th>
              <th className="rounded-r-xl pr-4 text-center">Actions</th>
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
                  <td className="py-2.5 pl-6">
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
                  <td className={styles.idCell}>
                    <span className="flex items-center gap-2">
                      {file.id}
                      {file.imported && <span title={importedLineage(file).note} className={styles.importedTag}>Imported</span>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-semibold">
                    <span className="flex items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 shrink-0 text-green-600" strokeWidth={1.5} aria-hidden />
                      {file.name}
                    </span>
                  </td>
                  {archived && <td className="whitespace-nowrap pl-4 pr-3">{file.archivedAt ? formatDate(file.archivedAt) : '—'}</td>}
                  <td className={classNames('whitespace-nowrap pr-3', !archived && 'pl-4')}>{formatDate(file.uploadedAt)}</td>
                  <td className="whitespace-nowrap pr-3 text-slate-500">{processingFunction(file)}</td>
                  <td>
                    <div className="whitespace-nowrap pr-3"><StatusBadge status={displayStatus(file, processingId, failedIds)} /></div>
                  </td>
                  <td>
                    <div className="pr-4 text-center">
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
