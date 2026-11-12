import { Check, X } from 'lucide-react';
import type { Toast } from '../../hooks/useArchive';
import styles from './files.module.css';

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
    <div role="status" className={styles.toast}>
      <span className={styles.toastIcon}><Check className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">{toast.title}</p>
        <p className="text-sm text-slate-600">{toast.detail}</p>
      </div>
      {toast.undo && (
        <div className="flex flex-col items-end gap-1">
          {/* Archiving waits for a processing batch to finish, so Undo says so instead of doing nothing. */}
          <button onClick={onUndo} disabled={archiving || processing} aria-describedby={processing ? 'undo-wait' : undefined} className={styles.undoButton}>
            Undo
          </button>
          {processing && <span id="undo-wait" className="text-xs text-slate-500">Available when processing finishes</span>}
        </div>
      )}
      <button onClick={onDismiss} aria-label="Dismiss notification" className="dismiss-button"><X className="h-5 w-5" /></button>
    </div>
  );
}
