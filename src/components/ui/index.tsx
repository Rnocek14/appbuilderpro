import { type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { Flame, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Overlay } from './Overlay';

export { Overlay } from './Overlay';

// ---------------- Button ----------------
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        // transition-all + active-scale gives buttons a tactile, "designed" feel
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 ease-forge active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-6 py-3 text-base',
        variant === 'primary' && 'bg-ember-gradient text-[#1A0E04] shadow-soft hover:shadow-liftEmber hover:-translate-y-px',
        variant === 'ghost' && 'text-forge-dim hover:text-forge-ink hover:bg-forge-raised',
        variant === 'outline' && 'border border-forge-border text-forge-ink hover:border-forge-ember/50 hover:bg-forge-raised',
        variant === 'danger' && 'bg-forge-err/15 text-forge-err border border-forge-err/30 hover:bg-forge-err/25',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={size === 'lg' ? 18 : 14} className="animate-spin" />}
      {children}
    </button>
  );
}

// ---------------- Input ----------------
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        // modern ring+offset focus (matches shadcn) instead of a bare border shift
        'w-full rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/70 transition-colors duration-150 focus:border-forge-ember/60 focus:outline-none focus:ring-2 focus:ring-forge-ember/30 focus:ring-offset-2 focus:ring-offset-forge-bg',
        className,
      )}
      {...rest}
    />
  );
}

// ---------------- Card ----------------
// `interactive` adds the hover-lift cue for clickable cards (premium feel)
export function Card({ className, children, interactive, style }: { className?: string; children: ReactNode; interactive?: boolean; style?: CSSProperties }) {
  return (
    <div style={style} className={cn('rounded-xl border border-forge-border bg-forge-panel bg-panel-sheen', interactive && 'card-lift cursor-pointer', className)}>
      {children}
    </div>
  );
}

// ---------------- Skeleton ----------------
// shimmer placeholders — replaces bare spinners for a polished loading state
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-forge-border bg-forge-panel p-4">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
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

// ---------------- Ember ----------------
// The brand working-indicator: a smoldering coal. The flame breathes — brightens as oxygen hits,
// cools back toward ash — while spark motes lift off and fade. Replaces generic spinners anywhere
// the forge is actually working. Static (dim flame, no sparks) under prefers-reduced-motion.
export function Ember({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} role="status" aria-label="Working">
      <Flame size={size} className="animate-smolder text-forge-ember motion-reduce:animate-none motion-reduce:opacity-60" />
      <span aria-hidden className="absolute -top-1 left-[55%] h-[3px] w-[3px] rounded-full bg-forge-heat animate-ashRise motion-reduce:hidden" style={{ '--ash-drift': '3px' } as CSSProperties} />
      <span aria-hidden className="absolute -top-0.5 left-[20%] h-[2px] w-[2px] rounded-full bg-forge-ember/90 animate-ashRise [animation-delay:0.8s] motion-reduce:hidden" style={{ '--ash-drift': '-2px' } as CSSProperties} />
      <span aria-hidden className="absolute top-0 left-[80%] h-[2px] w-[2px] rounded-full bg-forge-ember/70 animate-ashRise [animation-delay:1.5s] motion-reduce:hidden" style={{ '--ash-drift': '4px' } as CSSProperties} />
    </span>
  );
}

// ---------------- Modal ----------------
// A forge-dark modal on the shared Overlay primitive — Escape, focus-trap, scroll-lock, and
// focus-return all come from there, so this only owns its panel + heading.
export function Modal({ open, onClose, title, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'md' | 'lg' }) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose} z={50}>
      <div
        className={cn('w-full rounded-xl border border-forge-border bg-forge-panel bg-panel-sheen p-5 shadow-lift animate-scaleIn', size === 'lg' ? 'max-w-3xl' : 'max-w-md')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="mb-4 font-display text-lg font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </Overlay>
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
