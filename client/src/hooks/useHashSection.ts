import { useEffect, useRef } from 'react';
import { sectionFromHash } from '../lib/navigation';

/**
 * Applies the section named by the URL hash when the page is ready and whenever the hash changes
 * (a link, or the browser's Back and Forward). Unknown hashes are ignored.
 */
export function useHashSection<T extends string>(sections: readonly T[], apply: (section: T) => void, ready = true) {
  const latest = useRef(apply);
  useEffect(() => {
    latest.current = apply;
  });
  useEffect(() => {
    if (!ready) return;
    const run = () => {
      const section = sectionFromHash(window.location.hash, sections);
      if (section) latest.current(section);
    };
    run();
    window.addEventListener('hashchange', run);
    return () => window.removeEventListener('hashchange', run);
  }, [ready, sections]);
}
