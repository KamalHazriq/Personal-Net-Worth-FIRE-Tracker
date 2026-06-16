import { useEffect } from 'react';

export const getToken = () => localStorage.getItem('authToken') || '';
export const setToken = (t: string) => localStorage.setItem('authToken', t);
export const clearToken = () => localStorage.removeItem('authToken');

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
    ...init,
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    // session expired or app locked — prompt for the passcode again
    window.dispatchEvent(new CustomEvent('auth:required'));
    throw new Error('locked');
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = await res.json();
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET') window.dispatchEvent(new CustomEvent('data:changed'));
  return data;
}

/** Re-run `cb` when data is mutated anywhere or the window regains focus. */
export function useDataRefresh(cb: () => void) {
  useEffect(() => {
    const onChange = () => cb();
    const onFocus = () => cb();
    window.addEventListener('data:changed', onChange);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('data:changed', onChange);
      window.removeEventListener('focus', onFocus);
    };
  });
}
