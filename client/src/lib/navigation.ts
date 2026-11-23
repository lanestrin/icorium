/** Where the header's help icon and the navigation's help card lead: the repository README (setup and operating notes). */
export const HELP_URL = 'https://github.com/lanestrin/icorium#readme';

export type WorkspaceSection = 'dashboard' | 'files' | 'processing' | 'results';
export type AdminSection = 'invitations' | 'users' | 'access';

export const WORKSPACE_HASHES = ['files', 'processing', 'results'] as const satisfies readonly WorkspaceSection[];
export const ADMIN_HASHES = ['invitations', 'users', 'access'] as const satisfies readonly AdminSection[];

/** One navigation entry. path is '' for the file workspace; section is what the page applies on that path. */
export type NavEntry = { label: string; path: string; hash: string; section: WorkspaceSection | AdminSection };

export const WORKSPACE_ENTRIES: NavEntry[] = [
  { label: 'Dashboard', path: '', hash: '', section: 'dashboard' },
  { label: 'My Files', path: '', hash: '#files', section: 'files' },
  { label: 'Processing', path: '', hash: '#processing', section: 'processing' },
  { label: 'Results', path: '', hash: '#results', section: 'results' },
];

export const ADMIN_ENTRIES: NavEntry[] = [
  { label: 'Invitations', path: '/admin', hash: '#invitations', section: 'invitations' },
  { label: 'Users', path: '/admin', hash: '#users', section: 'users' },
  { label: 'Access & Roles', path: '/admin', hash: '#access', section: 'access' },
];

export const entryHref = (entry: NavEntry) => `${entry.path || '/'}${entry.hash}`;

/** The section a URL hash names, or undefined for no hash or one this page doesn't know. */
export function sectionFromHash<T extends string>(hash: string, allowed: readonly T[]): T | undefined {
  const name = hash.replace(/^#/, '');
  return allowed.find((section) => section === name);
}

/** Scrolls an element into view and moves focus to it (it needs tabIndex={-1}). Does nothing if it isn't there. */
export function showAndFocus(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView?.({ block: 'start' });
  element.focus({ preventScroll: true });
}
