'use client';

/** Tiny API client: keeps the access token in memory and refreshes it with the stored refresh token. */
const REFRESH_KEY = 'finanse.refresh';
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any) {
    super(message);
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function setSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  storage()?.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function hasSession() {
  return !!accessToken || !!storage()?.getItem(REFRESH_KEY);
}

export async function logout() {
  const refreshToken = storage()?.getItem(REFRESH_KEY);
  accessToken = null;
  storage()?.removeItem(REFRESH_KEY);
  if (refreshToken) await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) }).catch(() => {});
}

async function refresh(): Promise<boolean> {
  const refreshToken = storage()?.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  refreshing ??= fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) {
        storage()?.removeItem(REFRESH_KEY);
        accessToken = null;
        return false;
      }
      setSession(await res.json());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  if (!accessToken && retry && storage()?.getItem(REFRESH_KEY)) await refresh();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && retry && (await refresh())) return api<T>(path, init, false);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message.join(', ') : body?.message ?? res.statusText;
    if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('finanse:logout'));
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}
