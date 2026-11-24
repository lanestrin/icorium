import { describe, expect, it } from 'vitest';
import type { AccountState, Profile } from '../hooks/useAccount';
import { pageAccess, type AccessOutcome } from './access';

const signedIn = (profile: Profile | null): AccountState => ({ status: 'signed-in', userId: 'u1', email: 'a@b.c', profile });
const person = (role: Profile['role'], active: boolean): Profile => ({ name: 'Ada', role, active });

describe('pageAccess', () => {
  // [account, outcome for the workspace, outcome for an Admin page]
  const cases: [string, AccountState, AccessOutcome, AccessOutcome][] = [
    ['loading', { status: 'loading' }, 'loading', 'loading'],
    ['signed out', { status: 'signed-out' }, 'sign-in', 'sign-in'],
    ['a site without sign-in', { status: 'unconfigured' }, 'sign-in', 'sign-in'],
    ['a demo guest', { status: 'demo', sessionId: 's1' }, 'allow', 'admins-only'],
    ['an active Member', signedIn(person('Member', true)), 'allow', 'admins-only'],
    ['an active Admin', signedIn(person('Admin', true)), 'allow', 'allow'],
    ['no profile', signedIn(null), 'no-profile', 'no-profile'],
    ['an inactive Member', signedIn(person('Member', false)), 'inactive', 'inactive'],
    ['an inactive Admin', signedIn(person('Admin', false)), 'inactive', 'inactive'],
    ['a failed account read', { status: 'error', message: 'x' }, 'unavailable', 'unavailable'],
  ];
  it.each(cases)('%s', (_name, account, workspace, admin) => {
    expect(pageAccess(account, 'workspace')).toBe(workspace);
    expect(pageAccess(account, 'admin')).toBe(admin);
  });
});
