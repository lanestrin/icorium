import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INACTIVE_MESSAGE, UNAVAILABLE_FILES_MESSAGE } from './cloud-storage';

const rpc = vi.fn();
const client = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('./supabase', () => ({ getSupabase: async () => client.current, isAuthConfigured: () => true }));

import { openCloudWorkspace } from './api';

beforeEach(() => { rpc.mockReset(); client.current = { rpc }; });

describe('openCloudWorkspace', () => {
  it('asks the database whether the account is active before opening', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await openCloudWorkspace('u1')).toMatchObject({ mode: 'cloud' });
    expect(rpc).toHaveBeenCalledWith('is_active_account');
  });

  it('refuses an account the database says is not active', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(openCloudWorkspace('u1')).rejects.toMatchObject({ statusCode: 403, message: INACTIVE_MESSAGE });
  });

  it('reports an unreachable project or missing client as unavailable, not as an empty workspace', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down', status: 503 } });
    await expect(openCloudWorkspace('u1')).rejects.toMatchObject({ statusCode: 503, message: UNAVAILABLE_FILES_MESSAGE });
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(openCloudWorkspace('u1')).rejects.toMatchObject({ statusCode: 503 });
    client.current = null;
    await expect(openCloudWorkspace('u1')).rejects.toMatchObject({ statusCode: 503 });
  });
});
