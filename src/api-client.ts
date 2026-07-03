/**
 * API Client for Asimov ERP v2 backend.
 * Used by the Electron app to communicate with the centralized API
 * instead of (or alongside) the local SQLite database.
 */
import { net } from 'electron';
import Store from 'electron-store';

const store = new Store();

const API_URL_KEY = 'api.baseUrl';
const ACCESS_TOKEN_KEY = 'api.accessToken';
const REFRESH_TOKEN_KEY = 'api.refreshToken';
const TENANT_ID_KEY = 'api.tenantId';
const USER_KEY = 'api.user';

export interface ApiUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

export function getApiBaseUrl(): string {
  return (store.get(API_URL_KEY) as string) || 'http://localhost:3000/api/v1';
}

export function setApiBaseUrl(url: string): void {
  store.set(API_URL_KEY, url);
}

export function getAccessToken(): string | null {
  return (store.get(ACCESS_TOKEN_KEY) as string) || null;
}

export function getRefreshToken(): string | null {
  return (store.get(REFRESH_TOKEN_KEY) as string) || null;
}

export function getStoredUser(): ApiUser | null {
  return (store.get(USER_KEY) as ApiUser) || null;
}

export function getTenantId(): string | null {
  return (store.get(TENANT_ID_KEY) as string) || null;
}

function setAuthData(access: string, refresh: string, user: ApiUser): void {
  store.set(ACCESS_TOKEN_KEY, access);
  store.set(REFRESH_TOKEN_KEY, refresh);
  store.set(USER_KEY, user);
  store.set(TENANT_ID_KEY, user.tenantId);
}

function clearAuthData(): void {
  store.delete(ACCESS_TOKEN_KEY);
  store.delete(REFRESH_TOKEN_KEY);
  store.delete(USER_KEY);
  store.delete(TENANT_ID_KEY);
}

export function isCloudConnected(): boolean {
  return !!getAccessToken();
}

async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; skipAuth?: boolean } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;
  const method = options.method ?? 'GET';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!options.skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const response = await net.fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401 && !options.skipAuth) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return apiFetch(path, options);
    }
    clearAuthData();
    throw new Error('Sesión expirada. Inicie sesión nuevamente.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((body as { error?: string; message?: string }).error
      ?? (body as { message?: string }).message
      ?? `Error API ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function tryRefreshToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const res = await apiFetch<{
      success: boolean;
      data: { accessToken: string; refreshToken: string; user: ApiUser };
    }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: refresh },
      skipAuth: true,
    });

    setAuthData(res.data.accessToken, res.data.refreshToken, res.data.user);
    return true;
  } catch {
    return false;
  }
}

// --- Public API Methods ---

export async function apiLogin(
  email: string,
  password: string,
): Promise<{ user: ApiUser; tenantId: string }> {
  const res = await apiFetch<{
    success: boolean;
    data: { accessToken: string; refreshToken: string; user: ApiUser };
  }>('/auth/login', {
    method: 'POST',
    body: { email, password, deviceOrigin: 'desktop' },
    skipAuth: true,
  });

  setAuthData(res.data.accessToken, res.data.refreshToken, res.data.user);
  return { user: res.data.user, tenantId: res.data.user.tenantId };
}

export async function apiLogout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    // best-effort
  }
  clearAuthData();
}

export async function apiGetClients(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch<{ success: boolean; data: unknown[] }>(`/clients${params}`);
}

export async function apiGetClient(id: string) {
  return apiFetch<{ success: boolean; data: unknown }>(`/clients/${id}`);
}

export async function apiSaveClient(data: Record<string, unknown>) {
  const id = data.id as string | undefined;
  if (id) {
    return apiFetch<{ success: boolean; data: unknown }>(`/clients/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }
  return apiFetch<{ success: boolean; data: unknown }>('/clients', {
    method: 'POST',
    body: data,
  });
}

export async function apiGetProducts(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch<{ success: boolean; data: unknown[] }>(`/products${params}`);
}

export async function apiGetProduct(id: string) {
  return apiFetch<{ success: boolean; data: unknown }>(`/products/${id}`);
}

export async function apiGetDocuments(type?: string, params?: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  if (type) searchParams.set('type', type);
  const qs = searchParams.toString();
  return apiFetch<{ success: boolean; data: unknown[]; meta: unknown }>(`/documents${qs ? `?${qs}` : ''}`);
}

export async function apiCreateDocument(data: Record<string, unknown>) {
  return apiFetch<{ success: boolean; data: unknown }>('/documents', {
    method: 'POST',
    body: data,
  });
}

export async function apiGetStock(warehouseId: string) {
  return apiFetch<{ success: boolean; data: unknown[] }>(`/stock/warehouse/${warehouseId}`);
}

export async function apiGetStockAlerts() {
  return apiFetch<{ success: boolean; data: unknown[] }>('/stock/alerts');
}

export async function apiTestConnection(): Promise<boolean> {
  try {
    await apiFetch<{ status: string }>('/health');
    return true;
  } catch {
    return false;
  }
}
