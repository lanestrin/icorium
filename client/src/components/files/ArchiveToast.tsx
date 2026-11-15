import { Check, X } from 'lucide-react';
import type { Toast } from '../../hooks/useArchive';
import { Button } from '../ui/Button';
import styles from './files.module.scss';

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
      <span className={styles.toastIcon}><Check aria-hidden /></span>
      <div className={styles.toastText}>
        <p className={styles.toastTitle}>{toast.title}</p>
        <p className={styles.toastDetail}>{toast.detail}</p>
      </div>
      {toast.undo && (
        <div className={styles.toastActions}>
          {/* Archiving waits for a processing batch to finish, so Undo says so instead of doing nothing. */}
          <Button variant="outline" size="sm" onClick={onUndo} disabled={archiving || processing} aria-describedby={processing ? 'undo-wait' : undefined}>
            Undo
          </Button>
          {processing && <span id="undo-wait" className={styles.undoWait}>Available when processing finishes</span>}
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss notification" icon={<X />} />
    </div>
  );
}
