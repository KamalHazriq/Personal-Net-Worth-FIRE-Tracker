import { useEffect } from 'react';

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  // Broadcast that data changed so other open pages can refetch.
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET') window.dispatchEvent(new CustomEvent('data:changed'));
  return data;
}

/**
 * Re-run `cb` when data is mutated anywhere in the app or when the window/tab
 * regains focus — keeps figures consistent across pages without a full reload.
 */
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
