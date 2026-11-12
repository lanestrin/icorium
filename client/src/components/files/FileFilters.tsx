import { useId, type ReactNode } from 'react';
import { Calendar, ChevronDown, Filter, Layers, Search, type LucideIcon } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { PROCESSING_FUNCTIONS, STATUSES, type Status } from '../../lib/file-status';
import styles from './files.module.css';

/** A thin vertical line between filters on wide screens. */
const Divider = () => <div className={styles.divider} aria-hidden />;

/** A filter dropdown with its label above the chosen value, as in the filter card design. */
function SelectFilter({ icon: Icon, label, value, onChange, children }: {
  icon: LucideIcon; label: string; value: string; onChange: (value: string) => void; children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={classNames(styles.field, styles.selectField)}>
      <Icon className={styles.fieldIcon} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={classNames('menu-select', styles.fieldSelect)}>
          {children}
        </select>
      </div>
      <ChevronDown className={styles.fieldChevron} aria-hidden />
    </div>
  );
}

/** What the filter card shows and changes; the values live in useFilters. */
interface FileFiltersProps {
  search: string;
  setSearch: (value: string) => void;
  from: string;
  setFrom: (value: string) => void;
  to: string;
  setTo: (value: string) => void;
  fn: string;
  setFn: (value: string) => void;
  status: 'All' | Status;
  setStatus: (value: 'All' | Status) => void;
  filtersActive: boolean;
  clearFilters: () => void;
}

/** The filter card above the file list: search, date range, processing function and status. */
export function FileFilters({ search, setSearch, from, setFrom, to, setTo, fn, setFn, status, setStatus, filtersActive, clearFilters }: FileFiltersProps) {
  return (
    <div role="search" aria-label="Filter files" className={styles.filterCard}>
      <label className={classNames(styles.field, styles.searchField)}>
        <Search className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
        <input aria-label="Search file ID or name" className="w-full min-w-0 bg-transparent py-1.5 outline-none" placeholder="Search file ID or name..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <Divider />
      <div role="group" aria-labelledby="date-range-label" className={styles.field}>
        <Calendar className={styles.fieldIcon} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col">
          <span id="date-range-label" className="text-sm font-semibold">Date Range</span>
          <span className="flex min-w-0 items-center gap-2">
            <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={styles.fieldInput} />
            <span className="text-slate-400">–</span>
            <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={styles.fieldInput} />
          </span>
        </div>
      </div>
      <SelectFilter icon={Layers} label="Processing Function" value={fn} onChange={setFn}>
        <option value="All">All functions</option>
        {PROCESSING_FUNCTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </SelectFilter>
      <Divider />
      <SelectFilter icon={Filter} label="Status" value={status} onChange={(value) => setStatus(value as typeof status)}>
        <option value="All">All statuses</option>
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </SelectFilter>
      <Divider />
      <button onClick={clearFilters} disabled={!filtersActive} className={styles.clearFilters}>Clear filters</button>
    </div>
  );
}
