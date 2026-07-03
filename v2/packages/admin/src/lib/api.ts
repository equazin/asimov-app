const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { headers, ...rest });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? body.message ?? `API error ${res.status}`);
  }

  return res.json();
}

export function apiGet<T>(path: string, token?: string) {
  return apiFetch<T>(path, { token });
}

export function apiPost<T>(path: string, data: unknown, token?: string) {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(data), token });
}

export function apiPatch<T>(path: string, data: unknown, token?: string) {
  return apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(data), token });
}

export function apiDelete<T>(path: string, token?: string) {
  return apiFetch<T>(path, { method: 'DELETE', token });
}
