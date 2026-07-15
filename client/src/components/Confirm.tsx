import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { Modal, Button } from './ui';

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(() => Promise.resolve(false));

/** In-app replacement for window.confirm() — themed, keyboard/ESC-friendly, promise-based. */
export function useConfirm() {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) => new Promise((resolve) => setState({ opts, resolve })),
    [],
  );

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.opts.title ?? ''}>
        {state && (
          <>
            {state.opts.body && <p className="text-sm text-muted mb-4">{state.opts.body}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => close(false)}>
                {state.opts.cancelLabel ?? 'Cancel'}
              </Button>
              <Button variant={state.opts.danger ? 'danger' : 'default'} onClick={() => close(true)}>
                {state.opts.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}
