// src/lib/scaffold.ts
// Deterministic project scaffold for generated apps. Instead of asking the model to
// hand-write package.json / vite.config / tsconfig (error-prone and wasteful), we inject
// these fixed files and let the model author only the app code (App.tsx, pages, components).
// The result is a real, deployable Vite + TypeScript project that runs in the Sandpack
// vite-react-ts runtime — the same runtime that imported projects already use.

export interface ScaffoldFile { path: string; content: string }

// The curated dependency set generated apps may import. Keep in sync with the allow-list
// in the generation/edit prompts (prompts.ts).
const PACKAGE_JSON = `{
  "name": "fableforge-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "lucide-react": "^0.453.0",
    "recharts": "^2.13.0",
    "@supabase/supabase-js": "^2.45.4",
    "date-fns": "^4.1.0",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.10",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "typescript": "^5.6.2",
    "vite": "^5.4.8"
  }
}
`;

const VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": false,
    "esModuleInterop": true
  },
  "include": ["src"]
}
`;

// Tailwind is loaded via CDN so it works in the in-browser preview with no build step.
// The inline tailwind.config maps the shadcn/ui semantic tokens (bg-background, border-border,
// bg-card, text-muted-foreground, …) to the CSS variables defined in index.css, and turns on the
// class-based dark mode (`.dark` on <html>). This MUST match FableForge's preview shell config so
// the app looks identical in preview and when deployed standalone. The pre-paint script applies
// the saved/system theme before first render to avoid a light flash.
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        darkMode: ['class'],
        theme: { extend: {
          colors: {
            border: 'hsl(var(--border))', input: 'hsl(var(--input))', ring: 'hsl(var(--ring))',
            background: 'hsl(var(--background))', foreground: 'hsl(var(--foreground))',
            primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
            secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
            destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
            muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
            accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
            popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
            card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
          },
          // The FULL radius scale rides the token so a sharp (0px) or soft (24px) design identity
          // actually reaches the cards (rounded-xl/2xl are what cards use — without this mapping
          // they'd stay at Tailwind's fixed defaults and every app would have identical corners).
          borderRadius: { sm: 'calc(var(--radius) - 4px)', md: 'calc(var(--radius) - 2px)', lg: 'var(--radius)', xl: 'calc(var(--radius) + 4px)', '2xl': 'calc(var(--radius) + 8px)' },
          fontFamily: { sans: ['var(--font-sans, Inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
          // Motion utilities — CDN Tailwind has no tailwindcss-animate plugin, so we define the
          // keyframes shadcn/Radix components rely on (accordion, overlay enter/exit) plus a small
          // set of reusable entrances. This is what gives generated apps Lovable-tier polish.
          keyframes: {
            'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
            'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
            'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
            'fade-in-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
            'scale-in': { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
            'slide-in-right': { from: { opacity: '0', transform: 'translateX(12px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
            shimmer: { '100%': { transform: 'translateX(100%)' } },
          },
          animation: {
            'accordion-down': 'accordion-down 0.2s ease-out',
            'accordion-up': 'accordion-up 0.2s ease-out',
            'fade-in': 'fade-in 0.3s ease-out both',
            'fade-in-up': 'fade-in-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
            'scale-in': 'scale-in 0.18s cubic-bezier(0.22,1,0.36,1) both',
            'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.22,1,0.36,1) both',
            shimmer: 'shimmer 1.6s infinite',
          },
        } },
      };
    </script>
    <script>
      // Apply the saved/system theme before paint so there's no light flash on load.
      try {
        var t = localStorage.getItem('theme');
        if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

// Mounts the app inside a HashRouter. Hash routing keeps navigation inside the preview
// iframe (it never touches the real URL or the server), and still works when deployed
// with no server rewrite. Generated code uses <Routes>/<Link> normally.
const MAIN_TSX = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
);
`;

// Base stylesheet + design tokens. ONE coherent shadcn/ui token system: every semantic class
// (bg-background, bg-card, border-border, text-foreground, text-muted-foreground, bg-primary, …)
// resolves to these CSS variables, and dark mode is a single `.dark` class on <html> that
// redefines them all — so dark mode is complete by construction (no white borders / low-contrast
// text). Values match FableForge's preview shell so the app looks identical in preview and when
// deployed. To recolor the app, change these variables in ONE place.
const DEFAULT_INDEX_CSS = `:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.625rem;
}
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 212.7 26.8% 83.9%;
}
* { box-sizing: border-box; border-color: hsl(var(--border)); }
html, body, #root { height: 100%; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  -webkit-font-smoothing: antialiased;
}
h1,h2,h3 { line-height: 1.2; font-weight: 600; letter-spacing: -0.015em; }
/* Composed entrances: put .stagger on a list/grid container and its children cascade in.
   Delays are capped so long lists never feel slow. */
@keyframes stagger-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.stagger > * { opacity: 0; animation: stagger-in 0.45s cubic-bezier(0.16,1,0.3,1) forwards; }
.stagger > *:nth-child(1) { animation-delay: 0.04s; }
.stagger > *:nth-child(2) { animation-delay: 0.08s; }
.stagger > *:nth-child(3) { animation-delay: 0.12s; }
.stagger > *:nth-child(4) { animation-delay: 0.16s; }
.stagger > *:nth-child(5) { animation-delay: 0.2s; }
.stagger > *:nth-child(6) { animation-delay: 0.24s; }
.stagger > *:nth-child(7) { animation-delay: 0.28s; }
.stagger > *:nth-child(8) { animation-delay: 0.32s; }
.stagger > *:nth-child(n+9) { animation-delay: 0.36s; }
/* Hover lift for interactive/linked cards — transform+shadow only (compositor-friendly). */
.card-lift { transition: transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s cubic-bezier(0.16,1,0.3,1), border-color 0.2s; }
.card-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 24px -8px hsl(var(--foreground) / 0.14); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;

// ----------------------------------------------------------------
// UI kit — a small, cohesive component library seeded into every project so generated apps
// look designed, not hand-coded. Lightweight (Tailwind + lucide-react + clsx, no Radix).
// ----------------------------------------------------------------

const UTILS_TS = `import { clsx, type ClassValue } from 'clsx';

/** Conditionally join class names. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
`;

const TOAST_TSX = `import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: number; message: string; type: ToastType; }

const Ctx = createContext<{ toast: (message: string, type?: ToastType) => void } | null>(null);

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used within <ToastProvider>');
  return c;
}

let nextId = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextId;
    setItems((t) => [...t, { id, message, type }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg">
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
            {t.type === 'error' && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
            {t.type === 'info' && <Info className="h-4 w-4 shrink-0 text-blue-500" />}
            <span>{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
`;

const BUTTON_TSX = `import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};
const sizes: Record<Size, string> = { sm: 'h-9 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-11 px-6 text-base' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100', variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
`;

const INPUT_TSX = `import type { InputHTMLAttributes, TextareaHTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const field = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, 'h-10', className)} {...props} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'min-h-[80px]', className)} {...props} />;
}
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-foreground', className)} {...props} />;
}
`;

const SELECT_TSX = `import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring', className)}
      {...props}
    >
      {children}
    </select>
  );
}
`;

const CARD_TSX = `import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border px-5 py-4', className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold tracking-tight', className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-border px-5 py-4', className)} {...props} />;
}
`;

const BADGE_TSX = `import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red';
const tones: Record<Tone, string> = {
  gray: 'bg-muted text-muted-foreground',
  blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  green: 'bg-green-500/15 text-green-600 dark:text-green-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

export function Badge({ tone = 'gray', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)} {...props} />;
}
`;

const SPINNER_TSX = `import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary', className)} />;
}
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-muted', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
    </div>
  );
}
`;

const MODAL_TSX = `import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Accessible dialog: role="dialog" + aria-modal, labelled by its title, focus is trapped inside
// while open (Tab cycles), Escape closes, body scroll is locked, and focus returns to the trigger
// on close. Mark a control with data-autofocus to receive initial focus.
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []
    );
    (panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} tabIndex={-1} className="relative z-10 w-full max-w-lg animate-scale-in rounded-xl border border-border bg-card text-card-foreground shadow-xl focus:outline-none">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id={titleId} className="text-base font-semibold tracking-tight">{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-md text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
`;

const EMPTYSTATE_TSX = `import type { ReactNode } from 'react';

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="mb-1 text-lg font-semibold tracking-tight">{title}</h3>
      {description && <p className="mb-6 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
`;

const TABS_TSX = `import { createContext, useContext, useId, useRef, useState, type HTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Accessible tabs (WAI-ARIA pattern): ArrowLeft/Right + Home/End move between tabs, panels are
// labelled by their tab. Controlled (value + onValueChange) or uncontrolled (defaultValue).
interface TabsCtxValue { value: string; setValue: (v: string) => void; baseId: string }
const TabsCtx = createContext<TabsCtxValue | null>(null);

function useTabs(component: string): TabsCtxValue {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error(component + ' must be used inside <Tabs>');
  return ctx;
}
const slug = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, '-');

export function Tabs({ value, defaultValue, onValueChange, className, children }: {
  value?: string; defaultValue?: string; onValueChange?: (value: string) => void; className?: string; children: ReactNode;
}) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const baseId = useId();
  const current = value !== undefined ? value : inner;
  const setValue = (v: string) => { if (value === undefined) setInner(v); onValueChange?.(v); };
  return <TabsCtx.Provider value={{ value: current, setValue, baseId }}><div className={className}>{children}</div></TabsCtx.Provider>;
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? []);
    if (tabs.length === 0) return;
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    e.preventDefault();
    tabs[next]?.focus();
    tabs[next]?.click();
  };
  return <div ref={ref} role="tablist" onKeyDown={onKeyDown} className={cn('inline-flex items-center gap-1 rounded-lg bg-muted p-1', className)} {...props} />;
}

export function TabsTrigger({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  const ctx = useTabs('TabsTrigger');
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={ctx.baseId + '-tab-' + slug(value)}
      aria-selected={active}
      aria-controls={ctx.baseId + '-panel-' + slug(value)}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  const ctx = useTabs('TabsContent');
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={ctx.baseId + '-panel-' + slug(value)}
      aria-labelledby={ctx.baseId + '-tab-' + slug(value)}
      tabIndex={0}
      className={cn('mt-4 animate-fade-in focus:outline-none', className)}
    >
      {children}
    </div>
  );
}
`;

const DROPDOWN_TSX = `import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Accessible dropdown menu: click-outside + Escape close, ArrowUp/Down/Home/End move through
// items, Enter/Space activate, selecting closes. Pass any element (usually a <Button>) as trigger.
export function Dropdown({ trigger, align = 'start', className, children }: {
  trigger: ReactNode; align?: 'start' | 'end'; className?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      rootRef.current?.querySelector<HTMLElement>('button, [tabindex]')?.focus();
      return;
    }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (e.key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % items.length;
    if (e.key === 'ArrowUp') next = i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length;
    if (e.key === 'End') next = items.length - 1;
    e.preventDefault();
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className="relative inline-flex" onKeyDown={onKeyDown}>
      <span className="inline-flex" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {trigger}
      </span>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onClick={() => setOpen(false)}
          className={cn(
            'absolute top-full z-50 mt-1.5 min-w-[180px] animate-scale-in rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg',
            align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ onSelect, icon, danger, disabled, className, children }: {
  onSelect?: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:bg-accent',
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {icon && <span className="shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">{children}</div>;
}
`;

const POPOVER_TSX = `import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Lightweight non-modal popover anchored to its trigger: click to open, click-outside or Escape
// to close. Use for filters, pickers, and small forms attached to a control.
export function Popover({ trigger, align = 'start', side = 'bottom', className, children }: {
  trigger: ReactNode; align?: 'start' | 'end'; side?: 'top' | 'bottom'; className?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <span className="inline-flex" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}>{trigger}</span>
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute z-50 min-w-[240px] animate-scale-in rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg',
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
`;

const TOOLTIP_TSX = `import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Text tooltip on hover/focus (300ms hover delay, instant on keyboard focus). For icon-only
// buttons, ALSO give the button an aria-label.
export function Tooltip({ label, side = 'top', className, children }: {
  label: string; side?: 'top' | 'bottom'; className?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  const show = (delay: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), delay); };
  const hide = () => { window.clearTimeout(timer.current); setOpen(false); };
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => show(300)}
      onMouseLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 animate-fade-in whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-md',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            className,
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
`;

const COMBOBOX_TSX = `import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ComboboxOption { value: string; label: string }

// Searchable select (combobox pattern): type to filter, ArrowUp/Down to highlight, Enter to pick,
// Escape closes. Use instead of <Select> when there are more than ~8 options.
export function Combobox({ options, value, onChange, placeholder = 'Search…', emptyMessage = 'No results', className }: {
  options: ComboboxOption[]; value?: string; onChange: (value: string) => void;
  placeholder?: string; emptyMessage?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); return; }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && filtered[highlight]) { e.preventDefault(); pick(filtered[highlight].value); }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={open ? query : (selected?.label ?? '')}
          placeholder={selected ? selected.label : placeholder}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1.5 max-h-60 w-full animate-scale-in overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {filtered.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">{emptyMessage}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
              onMouseEnter={() => setHighlight(i)}
              className={cn('flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm', i === highlight ? 'bg-accent text-accent-foreground' : 'text-foreground')}
            >
              {o.label}
              {o.value === value && <Check className="h-4 w-4 text-primary" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;

const ALERT_TSX = `import type { ReactNode } from 'react';
import { Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'danger';
const toneBox: Record<Tone, string> = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-200',
  success: 'border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  danger: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200',
};

// Persistent inline notice (unlike a toast). Use for connection status, warnings, setup nudges.
export function Alert({ tone = 'info', title, children, className }: {
  tone?: Tone; title?: string; children?: ReactNode; className?: string;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertTriangle : tone === 'danger' ? XCircle : Info;
  return (
    <div role="alert" className={cn('flex gap-3 rounded-lg border p-4 text-sm', toneBox[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-1 opacity-90' : undefined}>{children}</div>}
      </div>
    </div>
  );
}
`;

const FORMFIELD_TSX = `import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Standard form row: label + control + hint/error with aria wiring. Pass ONE control (Input,
// Textarea, Select, Combobox) as the child — it receives id / aria-invalid / aria-describedby.
export function FormField({ label, hint, error, required, className, children }: {
  label: string; hint?: string; error?: string; required?: boolean; className?: string; children: ReactNode;
}) {
  const id = useId();
  const descId = id + '-desc';
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? descId : undefined,
      })
    : children;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {control}
      {(error || hint) && (
        <p id={descId} className={cn('text-sm', error ? 'text-destructive' : 'text-muted-foreground')}>{error ?? hint}</p>
      )}
    </div>
  );
}
`;

const PAGINATION_TSX = `import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

function pageWindow(page: number, pageCount: number): (number | '…')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (page > 3) pages.push('…');
  for (let p = Math.max(2, page - 1); p <= Math.min(pageCount - 1, page + 1); p++) pages.push(p);
  if (page < pageCount - 2) pages.push('…');
  pages.push(pageCount);
  return pages;
}

export function Pagination({ page, pageCount, onPageChange, className }: {
  page: number; pageCount: number; onPageChange: (page: number) => void; className?: string;
}) {
  if (pageCount <= 1) return null;
  const btn = 'inline-flex h-9 min-w-[36px] items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={cn(btn, 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === '…' ? (
          <span key={'gap-' + i} className="px-1.5 text-sm text-muted-foreground">…</span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPageChange(p)}
            className={cn(btn, p === page ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent')}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className={cn(btn, 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
`;

const TABLE_TSX = `import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// Styled data table per the design system: muted header, hover rows, comfortable density.
// Right-align numeric columns with className="text-right tabular-nums".
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-muted/50', className)} {...props} />;
}
export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-muted/50', className)} {...props} />;
}
export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground', className)} {...props} />;
}
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}
`;

const SCROLL_TS = `import { useEffect, useRef, useState } from 'react';

/**
 * True once the element scrolls into view (stays true by default) — drives reveal-on-scroll.
 * Pass { once: false } to toggle off again when it leaves (e.g. for repeating effects).
 */
export function useInView<T extends HTMLElement>(opts?: { once?: boolean; margin?: string }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const once = opts?.once !== false;
  const margin = opts?.margin ?? '0px 0px -10% 0px';
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); if (once) io.disconnect(); }
      else if (!once) setInView(false);
    }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [once, margin]);
  return { ref, inView };
}

/**
 * 0 -> 1 progress of an element travelling through the viewport — the engine for scroll-LINKED
 * motion (Apple-style scrubbed scenes). Attach ref to a tall wrapper (e.g. h-[200vh]) containing
 * a sticky stage (sticky top-0 h-screen), then map progress onto transforms:
 *   const { ref, progress } = useScrollProgress<HTMLDivElement>();
 *   <div ref={ref} className="relative h-[200vh]">
 *     <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
 *       <img style={{ transform: 'scale(' + (0.6 + progress * 0.4) + ') rotate(' + (progress * 12 - 6) + 'deg)', opacity: Math.min(1, progress * 2) }} … />
 *     </div>
 *   </div>
 * rAF-throttled; transform/opacity only (compositor-friendly). Honor reduced motion: the global
 * CSS rule kills transitions, and you can gate scrubbed scenes on matchMedia('(prefers-reduced-motion: reduce)').
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = r.height + vh;
      setProgress(Math.min(1, Math.max(0, (vh - r.top) / total)));
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return { ref, progress };
}
`;

const REVEAL_TSX = `import type { ReactNode } from 'react';
import { useInView } from '../../lib/scroll';
import { cn } from '../../lib/utils';

/**
 * Scroll-reveal wrapper: children fade + slide in the first time they enter the viewport.
 * Stagger siblings with increasing delay: <Reveal delay={0}/>, <Reveal delay={80}/>, …
 */
export function Reveal({ children, delay = 0, y = 16, className }: {
  children: ReactNode; delay?: number; y?: number; className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: delay + 'ms', transform: inView ? 'none' : 'translateY(' + y + 'px)' }}
      className={cn(
        'transition-all duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
        inView ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
`;

// Advanced scroll/motion primitives — the "expensive site" moves (pinned scrub scenes, parallax,
// count-ups, marquees) as guaranteed-working components, so the model COMPOSES them instead of
// hand-rolling scroll math (hand-rolled versions were the top source of broken landing pages).
const MOTION_TSX = `import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useInView, useScrollProgress } from '../../lib/scroll';
import { cn } from '../../lib/utils';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * ScrollScene — the Apple move, prebuilt: a pinned full-screen stage scrubbed by scroll.
 * Renders a tall wrapper (default 200vh) with a sticky stage inside; the render-prop receives
 * progress 0->1 — map it onto transform/opacity ONLY. Reduced-motion users get the final state.
 *
 *   <ScrollScene>
 *     {(p) => <img src={shot} style={{ transform: 'scale(' + (0.6 + p * 0.4) + ')', opacity: Math.min(1, p * 2) }} />}
 *   </ScrollScene>
 */
export function ScrollScene({ children, height = '200vh', className }: {
  children: (progress: number) => ReactNode;
  height?: string;
  className?: string;
}) {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const [reduced] = useState(reducedMotion);
  if (reduced) return <div className={className}>{children(1)}</div>;
  return (
    <div ref={ref} className={cn('relative', className)} style={{ height }}>
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        {children(progress)}
      </div>
    </div>
  );
}

/**
 * Parallax — a layer that drifts as it travels through the viewport (compose 2-3 at different
 * speeds for depth). speed -1..1: negative drifts against scroll (backgrounds), positive with it.
 */
export function Parallax({ children, speed = 0.3, className }: {
  children: ReactNode; speed?: number; className?: string;
}) {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const y = (progress - 0.5) * -2 * speed * 100;
  const style: CSSProperties = reducedMotion() ? {} : { transform: 'translate3d(0, ' + y.toFixed(1) + 'px, 0)' };
  return <div ref={ref} className={className} style={style}>{children}</div>;
}

/**
 * CountUp — a stat that counts up the first time it scrolls into view (eased, locale-formatted,
 * steady digits). <CountUp value={12500} suffix="+" /> · <CountUp value={99.9} decimals={1} suffix="%" />
 */
export function CountUp({ value, duration = 1400, prefix = '', suffix = '', decimals = 0, className }: {
  value: number; duration?: number; prefix?: string; suffix?: string; decimals?: number; className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reducedMotion()) { setN(value); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);
  const shown = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={ref} className={cn('tabular-nums', className)}>{prefix}{shown}{suffix}</span>;
}

/**
 * Marquee — an infinite horizontal strip (logo walls, testimonials, tickers). Seamless loop with
 * edge fade, pauses on hover; reduced-motion renders the items statically. speed = seconds/loop.
 */
export function Marquee({ children, speed = 40, reverse = false, className }: {
  children: ReactNode; speed?: number; reverse?: boolean; className?: string;
}) {
  if (reducedMotion()) {
    return <div className={cn('flex flex-wrap items-center gap-10 overflow-hidden', className)}>{children}</div>;
  }
  const mask = 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)';
  return (
    <div className={cn('group flex overflow-hidden', className)} style={{ maskImage: mask, WebkitMaskImage: mask }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden={i === 1}
          className="flex shrink-0 items-center gap-10 pr-10 [animation:ui-marquee_linear_infinite] group-hover:[animation-play-state:paused]"
          style={{ animationDuration: speed + 's', animationDirection: reverse ? 'reverse' : 'normal' }}
        >
          {children}
        </div>
      ))}
      <style>{'@keyframes ui-marquee { from { transform: translateX(0); } to { transform: translateX(-100%); } }'}</style>
    </div>
  );
}

/**
 * TextReveal — display type revealing word by word from behind a clip line (the award-site
 * standard for hero headlines). rotate adds a 3D ribbon flip per word. Triggers on scroll-in.
 *   <TextReveal as="h1" text="Roofing done right." className="text-6xl font-semibold" rotate />
 */
export function TextReveal({ text, as = 'h2', className, delay = 0, rotate = false }: {
  text: string; as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'div'; className?: string; delay?: number; rotate?: boolean;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const Tag = as;
  const shown = reducedMotion() || inView;
  return (
    <Tag className={className}>
      <span ref={ref} className="inline" style={rotate ? { perspective: '800px' } : undefined}>
        {text.split(' ').map((w, i) => (
          <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
            <span
              className="inline-block will-change-transform transition-transform duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
              style={{
                transitionDelay: (delay + i * 60) + 'ms',
                transform: shown ? 'none' : (rotate ? 'translateY(110%) rotateX(-80deg)' : 'translateY(110%)'),
                transformOrigin: 'bottom center',
              }}
            >
              {w}{'\\u00A0'}
            </span>
          </span>
        ))}
      </span>
    </Tag>
  );
}

/**
 * TiltCard — pointer-tracked 3D tilt with a moving glare highlight (the "premium product card"
 * move). Wrap any card; keep max modest (8-12deg). Static for reduced-motion users.
 */
export function TiltCard({ children, className, max = 10, glare = true }: {
  children: ReactNode; className?: string; max?: number; glare?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
  const onMove = (e: React.MouseEvent) => {
    if (reducedMotion()) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setT({ rx: (0.5 - py) * max, ry: (px - 0.5) * max, gx: px * 100, gy: py * 100, active: true });
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => setT((s) => ({ ...s, rx: 0, ry: 0, active: false }))}
      className={cn('relative will-change-transform', className)}
      style={{
        transform: 'perspective(900px) rotateX(' + t.rx.toFixed(2) + 'deg) rotateY(' + t.ry.toFixed(2) + 'deg)',
        transition: t.active ? 'transform 80ms linear' : 'transform 500ms cubic-bezier(0.16,1,0.3,1)',
        transformStyle: 'preserve-3d',
      }}
    >
      {children}
      {glare && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: t.active ? 1 : 0,
            background: 'radial-gradient(420px circle at ' + t.gx + '% ' + t.gy + '%, rgba(255,255,255,0.16), transparent 55%)',
          }}
        />
      )}
    </div>
  );
}

/**
 * StickyStack — cards pin under the header and stack over each other as you scroll (the
 * "deck of cards" transition). Each item MUST have its own solid background + border.
 *   <StickyStack items={[<FeatureCard1/>, <FeatureCard2/>, <FeatureCard3/>]} />
 */
export function StickyStack({ items, top = 88, gap = 18, className }: {
  items: ReactNode[]; top?: number; gap?: number; className?: string;
}) {
  return (
    <div className={className}>
      {items.map((child, i) => (
        <div key={i} className="sticky" style={{ top: (top + i * gap) + 'px', zIndex: i + 1, marginBottom: i === items.length - 1 ? 0 : '18vh' }}>
          {child}
        </div>
      ))}
    </div>
  );
}

/**
 * Aurora — a drifting, blurred color field (the shader-look without WebGL risk). Place inside a
 * relative, overflow-hidden section — pairs best with dark surfaces and a TextReveal on top.
 *   <section className="relative overflow-hidden bg-background"><Aurora hues={[222, 285, 165]} />…
 */
export function Aurora({ hues = [222, 285, 165], intensity = 0.3, className }: {
  hues?: number[]; intensity?: number; className?: string;
}) {
  const still = reducedMotion();
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {hues.slice(0, 4).map((h, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: '58%', height: '58%',
            left: (i * 26) + '%', top: (i % 2 === 0 ? -8 : 22) + '%',
            background: 'radial-gradient(circle, hsl(' + h + ' 85% 60% / ' + intensity + '), transparent 62%)',
            filter: 'blur(64px)',
            animation: still ? undefined : 'ui-aurora ' + (17 + i * 6) + 's ease-in-out infinite alternate',
            animationDelay: still ? undefined : (-i * 7) + 's',
          }}
        />
      ))}
      <style>{'@keyframes ui-aurora { from { transform: translate3d(-10%, -6%, 0) scale(1); } to { transform: translate3d(12%, 10%, 0) scale(1.22); } }'}</style>
    </div>
  );
}

/**
 * Spotlight — a cursor-following glow over a section or card grid. Subtle by default; the color
 * rides the theme's primary token.
 */
export function Spotlight({ children, className, size = 620 }: {
  children: ReactNode; className?: string; size?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: -9999, y: -9999 });
  return (
    <div
      ref={ref}
      className={cn('relative', className)}
      onMouseMove={(e) => {
        if (reducedMotion()) return;
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setPos({ x: -9999, y: -9999 })}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{ background: 'radial-gradient(' + size + 'px circle at ' + pos.x + 'px ' + pos.y + 'px, hsl(var(--primary) / 0.10), transparent 60%)' }}
      />
      {children}
    </div>
  );
}

/**
 * Magnetic — the wrapped element leans toward the cursor and springs back (reserve for the ONE
 * primary CTA; more than that reads gimmicky).
 */
export function Magnetic({ children, strength = 0.32, className }: {
  children: ReactNode; strength?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [d, setD] = useState({ x: 0, y: 0, active: false });
  return (
    <span
      ref={ref}
      className={cn('inline-block will-change-transform', className)}
      onMouseMove={(e) => {
        if (reducedMotion()) return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        setD({ x: (e.clientX - r.left - r.width / 2) * strength, y: (e.clientY - r.top - r.height / 2) * strength, active: true });
      }}
      onMouseLeave={() => setD({ x: 0, y: 0, active: false })}
      style={{
        transform: 'translate3d(' + d.x.toFixed(1) + 'px, ' + d.y.toFixed(1) + 'px, 0)',
        transition: d.active ? 'transform 100ms linear' : 'transform 450ms cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {children}
    </span>
  );
}

/**
 * ImageReveal — an image wipes in behind a clip-path and settles from a slight over-scale
 * (the editorial gallery move). Use in place of a bare <img> on marketing surfaces.
 */
export function ImageReveal({ src, alt = '', className, direction = 'up', delay = 0 }: {
  src: string; alt?: string; className?: string; direction?: 'up' | 'left' | 'right'; delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const shown = reducedMotion() || inView;
  const hidden = direction === 'left' ? 'inset(0 100% 0 0)' : direction === 'right' ? 'inset(0 0 0 100%)' : 'inset(100% 0 0 0)';
  return (
    <div ref={ref} className={cn('overflow-hidden', className)}
      style={{ clipPath: shown ? 'inset(0 0 0 0)' : hidden, transition: 'clip-path 900ms cubic-bezier(0.16,1,0.3,1) ' + delay + 'ms' }}>
      <img src={src} alt={alt} loading="lazy"
        className="h-full w-full object-cover will-change-transform"
        style={{ transform: shown ? 'scale(1)' : 'scale(1.16)', transition: 'transform 1100ms cubic-bezier(0.16,1,0.3,1) ' + delay + 'ms' }} />
    </div>
  );
}
`;

const ERRORBOUNDARY_TSX = `import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Root error boundary: a crash anywhere in the app renders a designed recovery panel instead of
 * a blank white screen — and reports the error so the platform's auto-fix can engage. Wraps <App/>
 * in main.tsx; add extra <ErrorBoundary> around individual routes for finer isolation if needed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info.componentStack);
    try {
      window.parent?.postMessage({ __ff: true, type: 'error', message: 'React crash: ' + (error?.message || String(error)) + '\\n' + (info?.componentStack || '') }, '*');
    } catch { /* not in the preview iframe — fine */ }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">!</div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Something went wrong</h1>
            <p className="mt-1 break-words text-sm text-muted-foreground">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.hash = '#/'; }}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
`;

// Theme hook — dark mode via a `.dark` class on <html>, persisted to localStorage and
// defaulting to the OS preference. A pre-paint script in index.html applies it before render
// to avoid a flash; this hook keeps React in sync and exposes a toggle.
const THEME_TS = `import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
    // The app's design can declare which theme it OPENS in (--default-theme in index.css) —
    // dark-first directions (pro tools, midnight) boot dark without waiting for a user toggle.
    const def = getComputedStyle(document.documentElement).getPropertyValue('--default-theme').trim();
    if (def === 'light' || def === 'dark') return def;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
}

/** Read/toggle the current theme. Use <ThemeToggle/> for a ready-made button. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  return {
    theme,
    setTheme: (t: Theme) => setThemeState(t),
    toggle: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
  };
}
`;

const THEMETOGGLE_TSX = `import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { cn } from '../../lib/utils';

/** A light/dark toggle button. Drop it in your header/nav. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
`;

const UI_INDEX_TS = `export * from './Button';
export * from './Input';
export * from './Select';
export * from './Card';
export * from './Badge';
export * from './Spinner';
export * from './Modal';
export * from './EmptyState';
export * from './ThemeToggle';
export * from './Tabs';
export * from './Dropdown';
export * from './Popover';
export * from './Tooltip';
export * from './Combobox';
export * from './Alert';
export * from './FormField';
export * from './Pagination';
export * from './Table';
export * from './Reveal';
export * from './Motion';
export * from './ErrorBoundary';
`;

const KIT: ScaffoldFile[] = [
  { path: '/src/lib/utils.ts', content: UTILS_TS },
  { path: '/src/lib/theme.ts', content: THEME_TS },
  { path: '/src/context/ToastContext.tsx', content: TOAST_TSX },
  { path: '/src/components/ui/Button.tsx', content: BUTTON_TSX },
  { path: '/src/components/ui/Input.tsx', content: INPUT_TSX },
  { path: '/src/components/ui/Select.tsx', content: SELECT_TSX },
  { path: '/src/components/ui/Card.tsx', content: CARD_TSX },
  { path: '/src/components/ui/Badge.tsx', content: BADGE_TSX },
  { path: '/src/components/ui/Spinner.tsx', content: SPINNER_TSX },
  { path: '/src/components/ui/Modal.tsx', content: MODAL_TSX },
  { path: '/src/components/ui/EmptyState.tsx', content: EMPTYSTATE_TSX },
  { path: '/src/components/ui/ThemeToggle.tsx', content: THEMETOGGLE_TSX },
  { path: '/src/components/ui/Tabs.tsx', content: TABS_TSX },
  { path: '/src/components/ui/Dropdown.tsx', content: DROPDOWN_TSX },
  { path: '/src/components/ui/Popover.tsx', content: POPOVER_TSX },
  { path: '/src/components/ui/Tooltip.tsx', content: TOOLTIP_TSX },
  { path: '/src/components/ui/Combobox.tsx', content: COMBOBOX_TSX },
  { path: '/src/components/ui/Alert.tsx', content: ALERT_TSX },
  { path: '/src/components/ui/FormField.tsx', content: FORMFIELD_TSX },
  { path: '/src/components/ui/Pagination.tsx', content: PAGINATION_TSX },
  { path: '/src/components/ui/Table.tsx', content: TABLE_TSX },
  { path: '/src/components/ui/Reveal.tsx', content: REVEAL_TSX },
  { path: '/src/components/ui/Motion.tsx', content: MOTION_TSX },
  { path: '/src/components/ui/ErrorBoundary.tsx', content: ERRORBOUNDARY_TSX },
  { path: '/src/lib/scroll.ts', content: SCROLL_TS },
  { path: '/src/components/ui/index.ts', content: UI_INDEX_TS },
];

// Files the model must NOT author — always authoritative from the scaffold.
const BASE: ScaffoldFile[] = [
  { path: '/package.json', content: PACKAGE_JSON },
  { path: '/vite.config.ts', content: VITE_CONFIG },
  { path: '/tsconfig.json', content: TSCONFIG },
  { path: '/index.html', content: INDEX_HTML },
  { path: '/src/main.tsx', content: MAIN_TSX },
  // Vite's client types — without this, `import.meta.env` fails to type-check in every app.
  { path: '/src/vite-env.d.ts', content: '/// <reference types="vite/client" />\n' },
];
const BASE_PATHS = new Set(BASE.map((f) => f.path));

/**
 * Merge model-authored files with the fixed scaffold. The scaffold's config/entry files
 * always win; a default index.css is supplied only if the model didn't write one.
 */
export function withScaffold(modelFiles: ScaffoldFile[]): ScaffoldFile[] {
  const out = modelFiles.filter((f) => !BASE_PATHS.has(f.path));
  out.push(...BASE);
  if (!out.some((f) => f.path === '/src/index.css')) {
    out.push({ path: '/src/index.css', content: DEFAULT_INDEX_CSS });
  }
  return out;
}

/** Paths the generation prompt should treat as already provided (config, entry, and UI kit). */
export const SCAFFOLD_PATHS = [...BASE_PATHS, '/src/index.css', ...KIT.map((f) => f.path)];

/** The full scaffold (config/entry + stylesheet + UI kit) to seed a project before the
 * model's source files stream in, so the preview can boot early and the kit is ready. */
export const SCAFFOLD_FILES: ScaffoldFile[] = [
  ...BASE,
  { path: '/src/index.css', content: DEFAULT_INDEX_CSS },
  ...KIT,
];

/**
 * The files that establish the shadcn token theme system, for RETROFITTING an existing project
 * onto it (the "set up proper light/dark theme" action): the token stylesheet, the theme hook,
 * the ThemeToggle, and the index.html that carries the Tailwind token config + pre-paint script.
 */
export const THEME_FOUNDATION: ScaffoldFile[] = [
  { path: '/src/index.css', content: DEFAULT_INDEX_CSS },
  { path: '/src/lib/theme.ts', content: THEME_TS },
  { path: '/src/lib/utils.ts', content: UTILS_TS },
  { path: '/src/components/ui/ThemeToggle.tsx', content: THEMETOGGLE_TSX },
  { path: '/index.html', content: INDEX_HTML },
];

/** Export line to append to /src/components/ui/index.ts so <ThemeToggle/> is importable. */
export const UI_INDEX_THEMETOGGLE_EXPORT = "export * from './ThemeToggle';";
