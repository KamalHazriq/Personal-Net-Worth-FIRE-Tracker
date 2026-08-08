import { useEffect, useRef } from 'react';

export const getToken = () => localStorage.getItem('authToken') || '';
export const setToken = (t: string) => localStorage.setItem('authToken', t);
export const clearToken = () => localStorage.removeItem('authToken');

/**
 * `silent: true` marks a mutation that doesn't change financial data (assistant
 * chat, auth) so it won't broadcast `data:changed` and make every listening page
 * refetch for nothing.
 */
export type ApiInit = RequestInit & { silent?: boolean };

export async function api<T = any>(path: string, init?: ApiInit): Promise<T> {
  const { silent, ...req } = init ?? {};
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
    ...req,
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
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && !silent) window.dispatchEvent(new CustomEvent('data:changed'));
  return data;
}

/**
 * Re-run `cb` when data is mutated anywhere or the window regains focus.
 *
 * `cb` is held in a ref so the listeners are attached once instead of being torn
 * down and re-added on every render, while still always calling the freshest
 * closure (so callers can safely close over props/state without a stale read).
 */
export function useDataRefresh(cb: () => void) {
  const latest = useRef(cb);
  useEffect(() => {
    latest.current = cb;
  });
  useEffect(() => {
    const run = () => latest.current();
    window.addEventListener('data:changed', run);
    window.addEventListener('focus', run);
    return () => {
      window.removeEventListener('data:changed', run);
      window.removeEventListener('focus', run);
    };
  }, []);
}
