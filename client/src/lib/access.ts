import { isActiveAdmin, type AccountState } from '../hooks/useAccount';

/** What a page needs: workspace is an active account or a demo guest; admin is an active Admin. */
export type Requirement = 'workspace' | 'admin';

/** What a protected page does for an account. Only allow opens it. */
export type AccessOutcome = 'allow' | 'loading' | 'sign-in' | 'admins-only' | 'no-profile' | 'inactive' | 'unavailable';

/**
 * The one access rule every protected page uses (build-plan 17.6). It decides what is displayed; row-level security
 * and the Admin function protect the data itself.
 */
export function pageAccess(account: AccountState, requirement: Requirement): AccessOutcome {
  switch (account.status) {
    case 'loading': return 'loading';
    case 'signed-out':
    case 'unconfigured': return 'sign-in';
    case 'error': return 'unavailable';
    case 'demo': return requirement === 'workspace' ? 'allow' : 'admins-only';
    case 'signed-in':
      if (!account.profile) return 'no-profile';
      if (!account.profile.active) return 'inactive';
      return requirement === 'workspace' || isActiveAdmin(account) ? 'allow' : 'admins-only';
  }
}
