import { Archive, ArrowLeftRight, RotateCcw } from 'lucide-react';
import { plural } from '../../lib/format';
import { Button } from '../ui/Button';
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
      <Button variant="link" size="sm" onClick={onClear}>Clear selection</Button>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {showCompare && compareReason && <span id="compare-reason" className="text-sm text-slate-600">{compareReason}</span>}
        {showCompare && (
          <Button onClick={onCompare} disabled={!!compareReason || comparing} aria-describedby={compareReason ? 'compare-reason' : undefined}
            icon={<ArrowLeftRight />}>
            Compare {plural(count)}
          </Button>
        )}
        <Button variant={showCompare ? 'secondary' : 'primary'} onClick={onArchive} disabled={archiveDisabled} icon={<ArchiveIcon />}>
          {viewArchived ? 'Restore' : 'Archive'} {plural(count)}
        </Button>
      </div>
    </div>
  );
}
