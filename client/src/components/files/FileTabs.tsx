import type { KeyboardEvent, ReactNode } from 'react';
import { classNames } from '../../lib/class-names';
import type { Tab } from '../../lib/file-status';
import styles from './files.module.css';

const TABS: { id: Tab; label: string }[] = [{ id: 'active', label: 'Active Files' }, { id: 'archived', label: 'Archived' }];

/**
 * The Active Files / Archived tabs with their counts. Arrow keys move between tabs, as in any tab list.
 * extra sits at the right end of the tab row (the Sort by menu), outside the tab list.
 */
export function FileTabs({ tab, setTab, counts, extra }: { tab: Tab; setTab: (tab: Tab) => void; counts: Record<Tab, number>; extra?: ReactNode }) {
  function moveWithArrowKeys(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = TABS[(TABS.findIndex((t) => t.id === tab) + 1) % TABS.length].id; // only two tabs, so either arrow switches
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div className={styles.tabsRow}>
      <div role="tablist" aria-label="File list" onKeyDown={moveWithArrowKeys} className="flex gap-1">
        {TABS.map((t) => {
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls="file-tabpanel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={classNames(styles.tab, isActive && styles.tabActive)}
            >
              {t.label}
              <span className={classNames('text-sm', isActive ? 'text-blue-700' : 'text-slate-500')}>{counts[t.id]}</span>
            </button>
          );
        })}
      </div>
      {extra && <div className="mb-2 ml-auto">{extra}</div>}
    </div>
  );
}
