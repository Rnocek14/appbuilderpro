import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

// ---------------- Button ----------------
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-forge-ember text-[#1A0E04] hover:bg-forge-heat',
        variant === 'ghost' && 'text-forge-dim hover:text-forge-ink hover:bg-forge-raised',
        variant === 'outline' && 'border border-forge-border text-forge-ink hover:border-forge-ember/50 hover:bg-forge-raised',
        variant === 'danger' && 'bg-forge-err/15 text-forge-err border border-forge-err/30 hover:bg-forge-err/25',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

// ---------------- Input ----------------
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/70 focus:border-forge-ember/60 focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
}

// ---------------- Card ----------------
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-forge-border bg-forge-panel', className)}>
      {children}
    </div>
  );
}

// ---------------- Badge ----------------
export function Badge({ tone = 'dim', children }: { tone?: 'dim' | 'ember' | 'ok' | 'err' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tone === 'dim' && 'border-forge-border text-forge-dim',
        tone === 'ember' && 'border-forge-ember/40 text-forge-ember bg-forge-ember/10',
        tone === 'ok' && 'border-forge-ok/40 text-forge-ok bg-forge-ok/10',
        tone === 'err' && 'border-forge-err/40 text-forge-err bg-forge-err/10',
        tone === 'warn' && 'border-forge-warn/40 text-forge-warn bg-forge-warn/10',
      )}
    >
      {children}
    </span>
  );
}

// ---------------- EmptyState ----------------
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-forge-border py-16 px-6 text-center">
      <div className="text-forge-dim">{icon}</div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-forge-dim">{body}</p>
      {action}
    </div>
  );
}

// ---------------- Spinner ----------------
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-forge-dim" role="status">
      <Loader2 size={16} className="animate-spin text-forge-ember" />
      {label ?? 'Loading…'}
    </div>
  );
}

// ---------------- Modal ----------------
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-xl border border-forge-border bg-forge-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ---------------- StatCard ----------------
export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-forge-dim">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-forge-dim">{hint}</p>}
    </Card>
  );
}
