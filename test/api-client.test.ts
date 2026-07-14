import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const storeData = new Map<string, unknown>();

vi.mock('electron', () => ({ net: { fetch: (...args: unknown[]) => fetchMock(...args) } }));
vi.mock('electron-store', () => ({
  default: class MemoryStore {
    get(key: string) { return storeData.get(key); }
    set(key: string, value: unknown) { storeData.set(key, value); }
    delete(key: string) { storeData.delete(key); }
  },
}));

import {
  apiAuthorizedFetch,
  apiLogin,
  CloudSessionExpiredError,
  isCloudConnected,
} from '../src/api-client';

const user = {
  userId: 'u1', email: 'owner@example.com', name: 'Owner', role: 'owner', tenantId: 't1',
};

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  storeData.clear();
  fetchMock.mockReset();
});

describe('apiAuthorizedFetch', () => {
  it('renueva el token después de un 401 y repite el request una vez', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { success: true, data: { accessToken: 'old', refreshToken: 'r1', user } }))
      .mockResolvedValueOnce(response(401, { message: 'expired' }))
      .mockResolvedValueOnce(response(200, { success: true, data: { accessToken: 'new', refreshToken: 'r2' } }))
      .mockResolvedValueOnce(response(200, { success: true }));

    await apiLogin('owner@example.com', 'secret');
    const result = await apiAuthorizedFetch('/sync/pull');

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const retryHeaders = fetchMock.mock.calls[3][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new');
  });

  it('borra la sesión si también falla el refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { success: true, data: { accessToken: 'old', refreshToken: 'r1', user } }))
      .mockResolvedValueOnce(response(401, { message: 'expired' }))
      .mockResolvedValueOnce(response(401, { message: 'invalid refresh' }));

    await apiLogin('owner@example.com', 'secret');
    await expect(apiAuthorizedFetch('/sync/pull')).rejects.toBeInstanceOf(CloudSessionExpiredError);
    expect(isCloudConnected()).toBe(false);
  });
});
