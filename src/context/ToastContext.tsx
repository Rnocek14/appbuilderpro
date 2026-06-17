import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string }

const ToastCtx = createContext<{ toast: (kind: ToastKind, message: string) => void }>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-lg bg-forge-raised',
              t.kind === 'success' && 'border-forge-ok/40',
              t.kind === 'error' && 'border-forge-err/40',
              t.kind === 'info' && 'border-forge-border',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-forge-ok" />}
            {t.kind === 'error' && <XCircle size={16} className="mt-0.5 shrink-0 text-forge-err" />}
            {t.kind === 'info' && <AlertTriangle size={16} className="mt-0.5 shrink-0 text-forge-warn" />}
            <span className="flex-1">{t.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="text-forge-dim hover:text-forge-ink"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
