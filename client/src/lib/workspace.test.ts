import { describe, expect, it } from 'vitest';
import type { AccountState } from '../hooks/useAccount';
import { workspaceChoice, workspaceKey } from './workspace';

const signedIn = (profile: Extract<AccountState, { status: 'signed-in' }>['profile']): AccountState => ({ status: 'signed-in', userId: 'u1', email: 'a@b.c', profile });

describe('workspaceChoice', () => {
  it('opens nothing for a site without sign-in or a signed-out visitor', () => {
    expect(workspaceChoice({ status: 'unconfigured' })).toEqual({ kind: 'closed' });
    expect(workspaceChoice({ status: 'signed-out' })).toEqual({ kind: 'closed' });
  });

  it('waits while the account loads', () => {
    expect(workspaceChoice({ status: 'loading' })).toEqual({ kind: 'pending' });
  });

  it('uses the cloud only for a signed-in account that is active', () => {
    expect(workspaceChoice(signedIn({ name: null, role: 'Member', active: true }))).toEqual({ kind: 'cloud', userId: 'u1' });
    expect(workspaceChoice(signedIn({ name: null, role: 'Admin', active: false }))).toEqual({ kind: 'closed' });
    expect(workspaceChoice(signedIn(null))).toEqual({ kind: 'closed' });
  });

  it('gives a demo guest their own temporary workspace, keyed by the session', () => {
    expect(workspaceChoice({ status: 'demo', sessionId: 's1' })).toEqual({ kind: 'demo', sessionId: 's1' });
    expect(workspaceKey({ kind: 'demo', sessionId: 's1' })).toBe('demo:s1');
    expect(workspaceKey({ kind: 'demo', sessionId: 's2' })).not.toBe(workspaceKey({ kind: 'demo', sessionId: 's1' }));
  });

  it('opens nothing when the account could not be read', () => {
    expect(workspaceChoice({ status: 'error', message: 'x' })).toMatchObject({ kind: 'unavailable' });
  });
});
