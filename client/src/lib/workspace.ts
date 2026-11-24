import type { AccountState } from '../hooks/useAccount';
import { UNAVAILABLE_FILES_MESSAGE } from './cloud-storage';

/** Shown when a run or upload stopped because the account's workspace changed (sign-out, another account) while it was going. */
export const WORKSPACE_CHANGED_MESSAGE = 'Your workspace changed, so this was stopped before it finished. Files not yet handled were left alone.';

/**
 * Which workspace the file actions use. pending: the account isn't known yet, so nothing opens (the browser's
 * samples must not appear and then vanish). unavailable: the account couldn't be confirmed, so no workspace opens.
 */
export type WorkspaceChoice =
  | { kind: 'pending' }
  | { kind: 'browser' }
  | { kind: 'cloud'; userId: string }
  | { kind: 'unavailable'; message: string };

/** The workspace for an account: the cloud only for a signed-in, active account; the browser for everyone else (until 17.6). */
export function workspaceChoice(account: AccountState): WorkspaceChoice {
  switch (account.status) {
    case 'loading': return { kind: 'pending' };
    case 'error': return { kind: 'unavailable', message: UNAVAILABLE_FILES_MESSAGE };
    case 'signed-in': return account.profile?.active ? { kind: 'cloud', userId: account.userId } : { kind: 'browser' };
    default: return { kind: 'browser' };
  }
}

/** Equal keys mean the same workspace. */
export const workspaceKey = (choice: WorkspaceChoice) => (choice.kind === 'cloud' ? `cloud:${choice.userId}` : choice.kind);
