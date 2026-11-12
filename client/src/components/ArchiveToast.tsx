import { Check, X } from 'lucide-react';
import type { Toast } from '../hooks/useArchive';

/**
 * The confirmation shown after archiving or restoring, with Undo. While a processing batch runs, Undo
 * is disabled and says it will be available when processing finishes.
 */
export function ArchiveToast({ toast, archiving, processing, onUndo, onDismiss }: {
  toast: Toast;
  archiving: boolean;
  processing: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div role="status" className="fixed inset-x-4 top-4 z-30 flex items-center gap-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg sm:left-auto sm:right-6 sm:w-104">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"><Check className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">{toast.title}</p>
        <p className="text-sm text-slate-600">{toast.detail}</p>
      </div>
      {toast.undo && (
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onUndo}
            // Archiving waits for a processing batch to finish, so Undo says so instead of doing nothing.
            disabled={archiving || processing}
            aria-describedby={processing ? 'undo-wait' : undefined}
            className="rounded-xl border border-blue-200 bg-white px-4 py-1.5 font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Undo
          </button>
          {processing && <span id="undo-wait" className="text-xs text-slate-500">Available when processing finishes</span>}
        </div>
      )}
      <button onClick={onDismiss} aria-label="Dismiss notification" className="text-slate-500 hover:text-slate-800"><X className="h-5 w-5" /></button>
    </div>
  );
}
