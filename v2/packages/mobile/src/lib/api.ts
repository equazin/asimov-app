import * as SecureStore from 'expo-secure-store';

const API_URL_KEY = 'api_base_url';
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

let cachedToken: string | null = null;
let baseUrl = 'http://localhost:3000/api/v1';

export interface ApiUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

export async function initApi(): Promise<void> {
  const stored = await SecureStore.getItemAsync(API_URL_KEY);
  if (stored) baseUrl = stored;
  cachedToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export function getBaseUrl(): string {
  return baseUrl;
}

export async function setBaseUrl(url: string): Promise<void> {
  baseUrl = url;
  await SecureStore.setItemAsync(API_URL_KEY, url);
}

export function getToken(): string | null {
  return cachedToken;
}

export function isAuthenticated(): boolean {
  return !!cachedToken;
}

async function saveTokens(access: string, refresh: string): Promise<void> {
  cachedToken = access;
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
}

async function clearTokens(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!refresh) return false;

  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    await saveTokens(data.data.accessToken, data.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; skipAuth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!options.skipAuth && cachedToken) {
    headers['Authorization'] = `Bearer ${cachedToken}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options.skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch(path, options);
    await clearTokens();
    throw new Error('SESSION_EXPIRED');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error ?? `Error ${res.status}`);
  }

  return res.json();
}

export async function login(email: string, password: string): Promise<ApiUser> {
  const res = await apiFetch<{
    success: boolean;
    data: { accessToken: string; refreshToken: string; user: ApiUser };
  }>('/auth/login', {
    method: 'POST',
    body: { email, password, deviceOrigin: 'mobile' },
    skipAuth: true,
  });

  await saveTokens(res.data.accessToken, res.data.refreshToken);
  return res.data.user;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch {
    // best-effort
  }
  await clearTokens();
}
