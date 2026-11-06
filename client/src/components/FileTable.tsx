import { Check, CircleAlert, Download, Eye, Layers, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { FileMeta } from '../../../shared/types';
import { api } from '../api';

export type Status = FileMeta['status'] | 'Processing' | 'Error';

/** Stored status, overridden while this file is processing or after its processing failed. */
export const displayStatus = (f: FileMeta, processingId?: string, failedIds?: Set<string>): Status =>
  f.id === processingId ? 'Processing' : failedIds?.has(f.id) ? 'Error' : f.status;

const BADGE: Record<Status, [string, LucideIcon]> = {
  Ready: ['bg-green-50 text-green-700', Check],
  Processed: ['bg-violet-50 text-violet-700', Layers],
  Processing: ['bg-blue-50 text-blue-700', LoaderCircle],
  Error: ['bg-red-50 text-red-700', CircleAlert],
};

function StatusBadge({ status }: { status: Status }) {
  const [cls, Icon] = BADGE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${cls}`}>
      <Icon className={`h-4 w-4 ${status === 'Processing' ? 'animate-spin' : ''}`} />
      {status === 'Processing' ? 'Processing…' : status}
    </span>
  );
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const CHECKBOX = 'h-[18px] w-[18px] cursor-pointer rounded accent-green-600 disabled:cursor-not-allowed disabled:opacity-40';

interface Props {
  files: FileMeta[];
  selectedIds: Set<string>;
  processingId?: string;
  failedIds: Set<string>;
  locked: boolean; // true while a batch runs
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  onPreview: (f: FileMeta) => void;
}

export function FileTable({ files, selectedIds, processingId, failedIds, locked, onToggle, onToggleAll, onPreview }: Props) {
  // Only input files can be processed, so only they are selectable.
  const inputs = files.filter((f) => f.status === 'Ready').map((f) => f.id);
  const checkedCount = inputs.filter((id) => selectedIds.has(id)).length;
  const allChecked = inputs.length > 0 && checkedCount === inputs.length;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-slate-700 [&>th]:bg-slate-50 [&>th]:py-3 [&>th]:font-semibold">
            <th className="w-14 rounded-l-xl pl-6">
              <input
                type="checkbox"
                className={CHECKBOX}
                aria-label="Select all input files"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = checkedCount > 0 && !allChecked; }}
                disabled={locked || !inputs.length}
                onChange={() => onToggleAll(inputs, !allChecked)}
              />
            </th>
            <th className="pl-1">File Name</th>
            <th className="text-center">Rows</th>
            <th className="text-center">Columns</th>
            <th className="pl-6">Uploaded</th>
            <th>Status</th>
            <th className="rounded-r-xl">Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const status = displayStatus(f, processingId, failedIds);
            const selectable = f.status === 'Ready' && !locked;
            const checked = selectedIds.has(f.id) && f.status === 'Ready';
            return (
              <tr
                key={f.id}
                onClick={() => selectable && onToggle(f.id)}
                className={`border-b border-slate-100 transition ${selectable ? 'cursor-pointer' : ''} ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <td className="py-2.5 pl-6">
                  <input
                    type="checkbox"
                    className={CHECKBOX}
                    aria-label={`Select ${f.name}`}
                    title={f.status === 'Processed' ? 'Result files cannot be processed again' : undefined}
                    checked={checked}
                    disabled={!selectable}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggle(f.id)}
                  />
                </td>
                <td className="py-2.5 pl-1 pr-4 font-semibold">{f.name}</td>
                <td className="text-center">{f.rows}</td>
                <td className="text-center">{f.columns}</td>
                <td className="whitespace-nowrap pl-6">{fmtDate(f.uploadedAt)}</td>
                <td><StatusBadge status={status} /></td>
                <td>
                  <div className="flex items-center gap-2 pr-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onPreview(f); }}
                      className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-1.5 hover:bg-slate-50"
                    >
                      <Eye className="h-4 w-4" /> Preview
                    </button>
                    <a
                      href={api.downloadUrl(f.id)}
                      onClick={(e) => e.stopPropagation()}
                      title="Download CSV"
                      aria-label={`Download ${f.name}`}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
          {!files.length && (
            <tr>
              <td colSpan={7} className="py-12 text-center text-slate-500">No CSV files match your filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
