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

describe('error messages without a server message', () => {
  it('says an upload Vercel refused as too large is over the online limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Request Entity Too Large', { status: 413 })));
    await expect(api.upload(new File(['a'], 'big.csv'))).rejects.toThrow('This file is too large to upload online. The limit is about 4.5 MB.');
  });

  it('names the error code when a response has no message', async () => {
    vi.stubGlobal('fetch', respond(504, {}));
    await expect(api.list()).rejects.toThrow("The server couldn't complete the request (error 504).");
  });

  it('treats an empty message as no message', async () => {
    vi.stubGlobal('fetch', respond(500, { message: '' }));
    await expect(api.compare(['101010-V', '101011-V'])).rejects.toThrow("The server couldn't complete the request (error 500).");
  });

  it('keeps the server message for a 413 the app itself refused', async () => {
    vi.stubGlobal('fetch', respond(413, { message: 'request file too large' }));
    await expect(api.upload(new File(['a'], 'big.csv'))).rejects.toThrow('request file too large');
  });
});
