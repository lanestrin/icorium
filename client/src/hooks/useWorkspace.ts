import { useLayoutEffect } from 'react';
import { api } from '../lib/api';
import { workspaceChoice, workspaceKey, type WorkspaceChoice } from '../lib/workspace';
import type { AccountState } from './useAccount';

/**
 * Points the file actions at the account's workspace (the demo, the cloud or none) and returns the choice. It runs as a layout
 * effect, so it takes effect before any page effect that loads files. key changes when the workspace does.
 */
export function useWorkspace(account: AccountState): { choice: WorkspaceChoice; key: string } {
  const choice = workspaceChoice(account);
  const key = workspaceKey(choice);
  useLayoutEffect(() => { api.setWorkspace(choice); }, [key]);
  return { choice, key };
}
