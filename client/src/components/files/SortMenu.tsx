import { ArrowDownUp, ChevronDown } from 'lucide-react';
import { SORT_OPTIONS, type SortKey } from '../../lib/file-status';
import styles from './files.module.css';

/** The "Sort by" menu beside the tabs. Sorting by archive date is offered only in the Archived tab. */
export function SortMenu({ sort, setSort, viewArchived }: { sort: SortKey; setSort: (key: SortKey) => void; viewArchived: boolean }) {
  const options = SORT_OPTIONS.filter((o) => viewArchived || !o.archivedOnly);
  return (
    <label className="flex items-center gap-3 text-slate-700">
      <ArrowDownUp className="h-5 w-5 shrink-0" aria-hidden />
      <span>Sort by</span>
      <span className="relative">
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={`menu-select ${styles.sortSelect}`}>
          {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <ChevronDown className={styles.sortChevron} aria-hidden />
      </span>
    </label>
  );
}
