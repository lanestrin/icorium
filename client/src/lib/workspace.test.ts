import { describe, expect, it } from 'vitest';
import type { AccountState } from '../hooks/useAccount';
import { workspaceChoice } from './workspace';

const signedIn = (profile: Extract<AccountState, { status: 'signed-in' }>['profile']): AccountState => ({ status: 'signed-in', userId: 'u1', email: 'a@b.c', profile });

describe('workspaceChoice', () => {
  it('uses the browser for a site without sign-in and for a signed-out visitor', () => {
    expect(workspaceChoice({ status: 'unconfigured' })).toEqual({ kind: 'browser' });
    expect(workspaceChoice({ status: 'signed-out' })).toEqual({ kind: 'browser' });
  });

  it('waits while the account loads', () => {
    expect(workspaceChoice({ status: 'loading' })).toEqual({ kind: 'pending' });
  });

  it('uses the cloud only for a signed-in account that is active', () => {
    expect(workspaceChoice(signedIn({ name: null, role: 'Member', active: true }))).toEqual({ kind: 'cloud', userId: 'u1' });
    expect(workspaceChoice(signedIn({ name: null, role: 'Admin', active: false }))).toEqual({ kind: 'browser' });
    expect(workspaceChoice(signedIn(null))).toEqual({ kind: 'browser' });
  });

  it('opens nothing when the account could not be read', () => {
    expect(workspaceChoice({ status: 'error', message: 'x' })).toMatchObject({ kind: 'unavailable' });
  });
});
