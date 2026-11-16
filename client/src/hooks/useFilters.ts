import { useState } from 'react';
import { type SortKey, type Status, type Tab } from '../lib/file-status';

/** The filter card, the tabs and each tab's sort order. */
export function useFilters() {
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'All' | Status>('All');
  const [fn, setFn] = useState('All'); // processing function filter: 'All', 'original' or a function id
  // Each tab keeps its own order: newest uploads first, and most recently archived first.
  const [sortBy, setSortBy] = useState<Record<Tab, SortKey>>({ active: 'uploaded-desc', archived: 'archived-desc' });
  const [tab, setTab] = useState<Tab>('active');

  const filtersActive = !!(search || from || to || status !== 'All' || fn !== 'All');
  const clearFilters = () => { setSearch(''); setFrom(''); setTo(''); setStatus('All'); setFn('All'); };
  const setSort = (key: SortKey) => setSortBy((b) => ({ ...b, [tab]: key }));
  /**
   * Shows what was just added: one processing function ('original' after an upload), today's date
   * range (the browser's local day, as filterFiles compares) and the Active Files tab, where new files
   * land. Search, status and sort are left as they are.
   */
  const showNewFiles = (functionId: string) => {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time
    setFn(functionId);
    setFrom(today);
    setTo(today);
    setTab('active');
  };

  return {
    search, setSearch, from, setFrom, to, setTo, status, setStatus, fn, setFn, tab, setTab,
    viewArchived: tab === 'archived', sort: sortBy[tab], setSort, filtersActive, clearFilters, showNewFiles,
  };
}
