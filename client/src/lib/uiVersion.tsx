import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type UiVersion = 'classic' | 'new';

function apply(version: UiVersion) {
  document.documentElement.setAttribute('data-ui', version);
}

interface UiVersionCtxValue {
  version: UiVersion;
  setVersion: (v: UiVersion) => void;
}

const UiVersionCtx = createContext<UiVersionCtxValue>({ version: 'classic', setVersion: () => {} });

/**
 * Opt-in visual redesign (grouped nav, refined card radius/shadow, PageHeader
 * typography) toggled from Settings → Appearance. Defaults to 'classic' so
 * nothing changes for existing users until they flip it on. Backed by a
 * context — mirrors ToastProvider/ConfirmProvider — so Settings' toggle,
 * Layout's nav, and PageHeader all share one live value instead of each
 * holding its own stale copy of localStorage read at mount time.
 */
export function useUiVersion() {
  return useContext(UiVersionCtx);
}

export function UiVersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState<UiVersion>(
    () => (localStorage.getItem('ui_version') as UiVersion) || 'classic',
  );
  useEffect(() => {
    apply(version);
    localStorage.setItem('ui_version', version);
  }, [version]);
  return <UiVersionCtx.Provider value={{ version, setVersion }}>{children}</UiVersionCtx.Provider>;
}
