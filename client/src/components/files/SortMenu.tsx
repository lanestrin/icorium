import { ArrowDownUp, ChevronDown } from 'lucide-react';
import { SORT_OPTIONS, type SortKey } from '../../lib/file-status';
import { classNames } from '../../lib/class-names';
import styles from './files.module.scss';

/** The "Sort by" menu beside the tabs. Sorting by archive date is offered only in the Archived tab. */
export function SortMenu({ sort, setSort, viewArchived }: { sort: SortKey; setSort: (key: SortKey) => void; viewArchived: boolean }) {
  const options = SORT_OPTIONS.filter((o) => viewArchived || !o.archivedOnly);
  return (
    <label className={styles.sortLabel}>
      <ArrowDownUp className={styles.sortIcon} aria-hidden />
      <span>Sort by</span>
      <span className={styles.sortControl}>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={classNames('menu-select', styles.sortSelect)}>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <ChevronDown className={styles.sortChevron} aria-hidden />
      </span>
    </label>
  );
}
