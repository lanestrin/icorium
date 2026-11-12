import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Download, Eye, MoreHorizontal, RotateCcw } from 'lucide-react';
import type { FileMeta } from '../../../../shared/types';
import { api } from '../../lib/api';
import styles from './files.module.css';

/**
 * The ⋯ Actions menu on every row: Preview and Download, plus Restore in the Archived tab.
 * Arrow keys move between items; Escape or a click outside closes it.
 */
export function RowMenu({ file, onPreview, onRestore, disabled }: { file: FileMeta; onPreview: () => void; onRestore?: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const label = `Actions for ${file.id} ${file.name}`;
  const menuItems = () => [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  // While open: focus the first item, and close on a click outside the menu.
  useEffect(() => {
    if (!open) return;
    menuItems()[0]?.focus();
    const closeOnOutsideClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  // Focus goes back to the trigger first, so a dialog the action opens returns focus there when it closes.
  function choose(action: () => void) {
    close();
    action();
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = menuItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === 'ArrowDown' ? 1 : items.length - 1;
    items[(current + step) % items.length]?.focus();
  }

  return (
    <div ref={box} className="relative inline-block" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
      <button ref={trigger} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={styles.menuTrigger}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" aria-label={label} className={styles.menu}>
          <button role="menuitem" tabIndex={-1} className={styles.menuItem} onClick={() => choose(onPreview)}>
            <Eye className="h-4 w-4" /> Preview file
          </button>
          <a role="menuitem" tabIndex={-1} className={styles.menuItem} href={api.downloadUrl(file.id)} onClick={() => setOpen(false)}>
            <Download className="h-4 w-4" /> Download file
          </a>
          {onRestore && (
            <button role="menuitem" tabIndex={-1} className={styles.menuItem} disabled={disabled} onClick={() => choose(onRestore)}>
              <RotateCcw className="h-4 w-4" /> Restore file
            </button>
          )}
        </div>
      )}
    </div>
  );
}
