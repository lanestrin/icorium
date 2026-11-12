import { Archive, ArrowLeftRight, RotateCcw } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { plural } from '../../lib/format';
import styles from './files.module.css';

/**
 * The toolbar shown above the file list while files are selected: the count, Clear selection, Compare
 * (with the reason when it cannot run) and Archive, or Restore in the Archived tab. When Compare is
 * offered it is the main (blue) button and Archive becomes the secondary one.
 */
export function SelectionBar({ count, onClear, showCompare, compareReason, comparing, onCompare, viewArchived, archiveDisabled, onArchive }: {
  count: number;
  onClear: () => void;
  showCompare: boolean;
  compareReason?: string;
  comparing: boolean;
  onCompare: () => void;
  viewArchived: boolean;
  archiveDisabled: boolean;
  onArchive: () => void;
}) {
  const ArchiveIcon = viewArchived ? RotateCcw : Archive;

  return (
    <div role="toolbar" aria-label="Selected files" className={styles.selectionBar}>
      <span className="font-semibold text-slate-900">{count} selected</span>
      <button onClick={onClear} className={styles.textButton}>Clear selection</button>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {showCompare && compareReason && <span id="compare-reason" className="text-sm text-slate-600">{compareReason}</span>}
        {showCompare && (
          <button onClick={onCompare} disabled={!!compareReason || comparing} aria-describedby={compareReason ? 'compare-reason' : undefined}
            className="btn btn-primary px-5 py-2">
            <ArrowLeftRight className="h-4 w-4" /> Compare {plural(count)}
          </button>
        )}
        <button onClick={onArchive} disabled={archiveDisabled} className={classNames('btn px-5 py-2', showCompare ? 'btn-secondary' : 'btn-primary')}>
          <ArchiveIcon className="h-4 w-4" />
          {viewArchived ? 'Restore' : 'Archive'} {plural(count)}
        </button>
      </div>
    </div>
  );
}
