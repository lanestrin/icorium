import { useState } from 'react';

/** Which files are checked. Holds File IDs, so a renamed file stays selected. */
export function useSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** Checks a file, or unchecks it when it is already checked. */
  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Checks (on = true) or unchecks every file in ids, leaving other selections alone. */
  function toggleAll(ids: string[], on: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return { selectedIds, setSelectedIds, toggle, toggleAll };
}
