import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import styles from './modals.module.css';

// Disabled fields cannot take focus, so they are left out of the Tab cycle.
const FOCUSABLE = 'a[href],button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside the dialog while it is open: focus moves in, Tab and Shift+Tab wrap around,
 * Escape closes, and focus returns to where it was when the dialog closes.
 */
function useDialogFocus(panel: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [panel]);
}

/**
 * Dialog shell with a title bar and a close button. full fills the screen on phones and nearly fills it on
 * larger screens; narrow is a small confirmation dialog; otherwise it is a wide dialog (up to 1400px, the
 * same width as full) for wide content such as a CSV preview.
 */
export function Modal({ title, subtitle, actions, narrow, full, onClose, children }: {
  title: string; subtitle?: string; actions?: ReactNode; narrow?: boolean; full?: boolean; onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(panel, onClose);

  const size = full ? styles.panelFull : classNames(styles.panelDialog, narrow ? styles.panelNarrow : styles.panelWide);

  return (
    <div className={classNames(styles.backdrop, full ? styles.backdropFull : styles.backdropPadded)} onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={classNames(styles.panel, size)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {actions}
          <button onClick={onClose} className={styles.closeButton} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
