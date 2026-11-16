import { Archive, ArrowLeftRight, LoaderCircle, RotateCcw } from 'lucide-react';
import { plural } from '../../lib/format';
import { Button } from '../ui/Button';
import styles from './files.module.scss';

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
      <span className={styles.selectionCount}>{count} selected</span>
      <Button variant="link" size="sm" onClick={onClear}>Clear selection</Button>
      <div className={styles.selectionActions}>
        {showCompare && compareReason && <span id="compare-reason" className={styles.compareReason}>{compareReason}</span>}
        {showCompare && (
          // While the comparison loads, Compare stays focusable (aria-disabled, not disabled): a disabled button
          // drops keyboard focus to the page, and the dialog would then return focus there instead of here.
          // A second press is ignored by onCompare.
          <Button onClick={onCompare} disabled={!!compareReason} aria-disabled={comparing || undefined} aria-busy={comparing || undefined}
            aria-describedby={compareReason ? 'compare-reason' : undefined}
            icon={comparing ? <LoaderCircle className={styles.spinning} aria-hidden /> : <ArrowLeftRight />}>
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
