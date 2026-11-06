import { Check, CircleAlert, Download, Eye, File as FileIcon, Layers, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { FileMeta } from '../../../shared/types';
import { api } from '../api';

type Status = FileMeta['status'] | 'Processing' | 'Error';

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
      {status}
    </span>
  );
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

interface Props {
  files: FileMeta[];
  selectedId?: string;
  processingId?: string;
  failedId?: string;
  onSelect: (id: string) => void;
  onPreview: (f: FileMeta) => void;
}

export function FileTable({ files, selectedId, processingId, failedId, onSelect, onPreview }: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-slate-700 [&>th]:bg-slate-50 [&>th]:py-3 [&>th]:font-semibold">
            <th className="rounded-l-xl pl-16">File Name</th>
            <th className="text-center">Rows</th>
            <th className="text-center">Columns</th>
            <th className="pl-6">Uploaded</th>
            <th>Status</th>
            <th className="rounded-r-xl">Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const status: Status = f.id === processingId ? 'Processing' : f.id === failedId ? 'Error' : f.status;
            return (
              <tr
                key={f.id}
                onClick={() => onSelect(f.id)}
                className={`cursor-pointer border-b border-slate-100 transition ${f.id === selectedId ? 'bg-blue-50 outline-2 -outline-offset-2 outline-blue-300' : 'hover:bg-slate-50'}`}
              >
                <td className="py-2.5 pl-6 pr-4">
                  <div className="flex items-center gap-5">
                    <FileIcon className="h-6 w-6 shrink-0 text-green-600" strokeWidth={1.5} />
                    <span className="font-semibold">{f.name}</span>
                  </div>
                </td>
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
              <td colSpan={6} className="py-12 text-center text-slate-500">No CSV files match your filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
