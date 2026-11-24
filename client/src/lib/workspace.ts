import type { AccountState } from '../hooks/useAccount';
import { UNAVAILABLE_FILES_MESSAGE } from './cloud-storage';

/** Shown when a run or upload stopped because the account's workspace changed (sign-out, another account) while it was going. */
export const WORKSPACE_CHANGED_MESSAGE = 'Your workspace changed, so this was stopped before it finished. Files not yet handled were left alone.';

/** Shown when a file action runs while no workspace may be open. */
export const CLOSED_MESSAGE = 'Sign in or start the demo to open a workspace.';

/**
 * Which workspace the file actions use. pending: the account isn't known yet, so nothing opens. closed: the account
 * has no workspace (signed out, sign-in not set up, no profile, deactivated). unavailable: the account couldn't be confirmed.
 */
export type WorkspaceChoice =
  | { kind: 'pending' }
  | { kind: 'closed' }
  | { kind: 'cloud'; userId: string }
  | { kind: 'demo'; sessionId: string }
  | { kind: 'unavailable'; message: string };

/** The workspace for an account: the cloud for a signed-in, active account, a demo's own files for its guest, nothing for anyone else (17.6). */
export function workspaceChoice(account: AccountState): WorkspaceChoice {
  switch (account.status) {
    case 'loading': return { kind: 'pending' };
    case 'demo': return { kind: 'demo', sessionId: account.sessionId };
    case 'error': return { kind: 'unavailable', message: UNAVAILABLE_FILES_MESSAGE };
    case 'signed-in': return account.profile?.active ? { kind: 'cloud', userId: account.userId } : { kind: 'closed' };
    default: return { kind: 'closed' };
  }
}

/** Equal keys mean the same workspace. */
export const workspaceKey = (choice: WorkspaceChoice) =>
  choice.kind === 'cloud' ? `cloud:${choice.userId}` : choice.kind === 'demo' ? `demo:${choice.sessionId}` : choice.kind;
