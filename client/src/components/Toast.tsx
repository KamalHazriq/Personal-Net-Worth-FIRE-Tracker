import { createContext, useContext, useState, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/** `tone` defaults to 'success'; 'error' is for surfacing failed writes. */
type Tone = 'success' | 'error';
type Toast = { id: number; msg: string; tone: Tone };
type ToastFn = (msg: string, tone?: Tone) => void;
const ToastCtx = createContext<ToastFn>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast: ToastFn = (msg, tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    // errors carry something to act on, so they linger a little longer
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 4200 : 2200);
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
            {t.tone === 'error' ? (
              <AlertTriangle size={15} className="text-loss shrink-0" />
            ) : (
              <CheckCircle2 size={15} className="text-gain shrink-0" />
            )}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
