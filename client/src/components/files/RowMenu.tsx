import { useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Download, Eye, MoreHorizontal, RotateCcw } from 'lucide-react';
import type { FileMeta } from '../../../../shared/types';
import styles from './files.module.scss';

/**
 * The ⋯ Actions menu on every row: Preview and Download, plus Restore in the Archived tab. Built on Radix
 * DropdownMenu: arrow keys move between items and wrap, Escape or a click outside closes it, and focus
 * returns to ⋯. It is non-modal, so the page stays usable and a click outside also reaches what was clicked.
 */
export function RowMenu({ file, onPreview, onDownload, onRestore, disabled }: { file: FileMeta; onPreview: () => void; onDownload: () => void; onRestore?: () => void; disabled?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  // The action chosen from the menu, run once the menu has closed (see runAfterClose).
  const chosen = useRef<() => void>(undefined);
  const label = `Actions for ${file.id} ${file.name}`;

  // Focus goes back to ⋯ before the action runs, so a dialog the action opens remembers ⋯ as its opener
  // and returns focus there when it closes.
  function runAfterClose(event: Event) {
    const action = chosen.current;
    if (!action) return; // nothing chosen: Radix returns focus as usual
    chosen.current = undefined;
    event.preventDefault();
    trigger.current?.focus();
    action();
  }

  return (
    // React passes events from the menu's portal up through this element, so clicks in the menu
    // stop here instead of toggling the row.
    <div className={styles.menuWrapper} onClick={(e) => e.stopPropagation()}>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger ref={trigger} aria-label={label} className={styles.menuTrigger}>
          <MoreHorizontal aria-hidden />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content aria-label={label} align="end" sideOffset={4} loop className={styles.menu} onCloseAutoFocus={runAfterClose}>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => { chosen.current = onPreview; }}>
              <Eye aria-hidden /> Preview file
            </DropdownMenu.Item>
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => { chosen.current = onDownload; }}>
              <Download aria-hidden /> Download file
            </DropdownMenu.Item>
            {onRestore && (
              <DropdownMenu.Item className={styles.menuItem} disabled={disabled} onSelect={() => { chosen.current = onRestore; }}>
                <RotateCcw aria-hidden /> Restore file
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
