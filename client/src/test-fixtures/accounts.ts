// The account a page gets from its gate (build-plan 17.6). Tests only.
import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import type { AccountApi } from '../components/layout/AccountMenu';
import type { AccountState, Profile } from '../hooks/useAccount';

export const DEMO_SESSION = '11111111-1111-4111-8111-111111111111';

export const demo: AccountState = { status: 'demo', sessionId: DEMO_SESSION, kind: 'standard' };
export const signedIn = (profile: Partial<Profile> | null = {}, userId = 'user-1'): AccountState => ({
  status: 'signed-in', userId, email: 'ada@example.com', profile: profile && { name: 'Ada', role: 'Member', active: true, ...profile },
});
export const admin = signedIn({ role: 'Admin' });

export const accountApi = (account: AccountState): AccountApi => ({ account, actionError: null, signOut: vi.fn(), saveName: vi.fn() });

/** The page's own status message: the header also announces the account. */
export function queryPageStatus(options?: { hidden?: boolean }): HTMLElement | null {
  const found = screen.queryAllByRole('status', options).filter((element) => !element.closest('header'));
  if (found.length > 1) throw new Error('Found more than one page status');
  return found[0] ?? null;
}
export function pageStatus(options?: { hidden?: boolean }): HTMLElement {
  const found = queryPageStatus(options);
  if (!found) throw new Error('Found no page status');
  return found;
}
export const findPageStatus = () => waitFor(() => pageStatus());
