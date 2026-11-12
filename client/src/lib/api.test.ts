import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
afterEach(() => { vi.unstubAllGlobals(); });

describe('api.process', () => {
  it('sends replace: true only when asked', async () => {
    const fetch = respond(200, { id: '101010-V' });
    vi.stubGlobal('fetch', fetch);
    await api.process('101010', 'validation');
    await api.process('101010', 'validation', true);
    const bodies = fetch.mock.calls.map((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string));
    expect(bodies).toEqual([{ fileId: '101010', processor: 'validation' }, { fileId: '101010', processor: 'validation', replace: true }]);
  });

  it('rejects a refused re-run with the server message and the existing result', async () => {
    const conflict = { message: 'Composition Validation has already been run for file 101010.', existing: { id: '101010-V', name: 'r.csv', archived: true } };
    vi.stubGlobal('fetch', respond(409, conflict));
    await expect(api.process('101010', 'validation')).rejects.toMatchObject({ message: conflict.message, conflict });
  });

  it('rejects other errors with their message only', async () => {
    vi.stubGlobal('fetch', respond(400, { message: 'Select an input file, not a result file' }));
    const error = await api.process('101010-V', 'validation').catch((e: unknown) => e);
    expect(error).toMatchObject({ message: 'Select an input file, not a result file' });
    expect(error).not.toHaveProperty('conflict');
  });
});
