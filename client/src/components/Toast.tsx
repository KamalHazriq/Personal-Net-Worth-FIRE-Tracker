import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

type Toast = { id: number; msg: string };
const ToastCtx = createContext<(msg: string) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = (msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200);
  };
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed z-[60] bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm shadow-lg animate-[fadeIn_0.15s_ease]"
          >
            <CheckCircle2 size={15} className="text-gain" />
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
