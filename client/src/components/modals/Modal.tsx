import { useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { classNames } from '../../lib/class-names';
import { Button } from '../ui/Button';
import styles from './modals.module.scss';

/**
 * Dialog shell with a title bar and a close button, built on Radix Dialog. Parents mount it only while it
 * is open. Radix keeps Tab and Shift+Tab inside, hides the page behind it from screen readers, closes on
 * Escape or a click on the backdrop, and returns focus to the element that opened it.
 *
 * full fills the screen on phones and nearly fills it on larger screens; narrow is a small confirmation
 * card; otherwise it is a wide dialog (up to 1400px, the same width as full) for wide content such as a
 * CSV preview, which also fills a phone's screen. On phones the actions get their own row under the title.
 */
export function Modal({ title, subtitle, actions, narrow, full, onClose, children }: {
  title: string; subtitle?: string; actions?: ReactNode; narrow?: boolean; full?: boolean; onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // The element that had focus when the dialog opened (the button that opened it). Radix returns focus only
  // to a Dialog.Trigger, and the parents open dialogs from their own buttons, so the dialog remembers it.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  // Focus the panel itself on open (not its first button), so screen readers start at the title.
  function focusPanel(event: Event) {
    event.preventDefault();
    panel.current?.focus();
  }

  function returnFocus(event: Event) {
    event.preventDefault();
    opener?.focus();
  }

  const size = full ? styles.panelFull : classNames(styles.panelDialog, narrow ? styles.panelNarrow : styles.panelWide);
  const backdrop = narrow && !full ? styles.backdropPadded : styles.backdropFull;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        {/* The panel sits inside the backdrop so the backdrop can centre it; a click on the backdrop closes. */}
        <Dialog.Overlay className={classNames(styles.backdrop, backdrop)}>
          <Dialog.Content
            ref={panel}
            className={classNames(styles.panel, size)}
            onOpenAutoFocus={focusPanel}
            onCloseAutoFocus={returnFocus}
            {...(subtitle ? {} : { 'aria-describedby': undefined })}
          >
            <div className={styles.header}>
              <div className={styles.heading}>
                <Dialog.Title className={styles.title} title={title}>{title}</Dialog.Title>
                {subtitle && <Dialog.Description className={styles.subtitle}>{subtitle}</Dialog.Description>}
              </div>
              {actions && <div className={styles.actions}>{actions}</div>}
              <Button variant="ghost" onClick={onClose} aria-label="Close" icon={<X />} />
            </div>
            <div className={styles.body}>{children}</div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
