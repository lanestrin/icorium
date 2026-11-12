import { Archive, ArrowLeftRight, RotateCcw } from 'lucide-react';
import { plural } from '../lib/format';

/**
 * The toolbar shown above the file list while files are selected: the count, Clear selection, Compare
 * (with the reason when it cannot run) and Archive, or Restore in the Archived tab.
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
  return (
    <div role="toolbar" aria-label="Selected files" className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-blue-50/70 px-4 py-2.5">
      <span className="font-semibold text-slate-900">{count} selected</span>
      <button onClick={onClear} className="text-sm font-medium text-blue-700 hover:underline">
        Clear selection
      </button>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {showCompare && compareReason && <span id="compare-reason" className="text-sm text-slate-600">{compareReason}</span>}
        {showCompare && (
          <button
            onClick={onCompare}
            disabled={!!compareReason || comparing}
            aria-describedby={compareReason ? 'compare-reason' : undefined}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeftRight className="h-4 w-4" /> Compare {plural(count)}
          </button>
        )}
        <button
          onClick={onArchive}
          disabled={archiveDisabled}
          className={`flex items-center gap-2 rounded-xl px-5 py-2 font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${showCompare ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          {viewArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {viewArchived ? 'Restore' : 'Archive'} {plural(count)}
        </button>
      </div>
    </div>
  );
}
