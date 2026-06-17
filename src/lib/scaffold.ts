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
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
    <script src="https://cdn.tailwindcss.com"></script>
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
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </HashRouter>
  </React.StrictMode>,
);
`;

// Base stylesheet + design tokens. Dark mode follows the OS (Tailwind CDN default), and
// components use the dark: variant. Semantic CSS variables are available for custom styling.
const DEFAULT_INDEX_CSS = `:root {
  color-scheme: light dark;
  --color-primary: #2563eb;
  --color-bg: #f8fafc;
  --color-surface: #ffffff;
  --color-border: #e2e8f0;
  --color-text: #0f172a;
  --color-muted: #64748b;
  --radius: 0.625rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0b1120;
    --color-surface: #0f172a;
    --color-border: #1e293b;
    --color-text: #e2e8f0;
    --color-muted: #94a3b8;
  }
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}
h1,h2,h3 { line-height: 1.2; font-weight: 600; }
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
          <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
            {t.type === 'error' && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
            {t.type === 'info' && <Info className="h-4 w-4 shrink-0 text-blue-500" />}
            <span className="text-slate-800 dark:text-slate-100">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-4 w-4" /></button>
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
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 focus-visible:ring-slate-400',
  outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:ring-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 focus-visible:ring-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-11 px-6 text-base' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], className)}
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

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, 'h-10', className)} {...props} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, 'min-h-[80px]', className)} {...props} />;
}
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300', className)} {...props} />;
}
`;

const SELECT_TSX = `import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100', className)}
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
  return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900', className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-slate-100 px-5 py-4 dark:border-slate-800', className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-slate-900 dark:text-slate-100', className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-t border-slate-100 px-5 py-4 dark:border-slate-800', className)} {...props} />;
}
`;

const BADGE_TSX = `import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red';
const tones: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function Badge({ tone = 'gray', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)} {...props} />;
}
`;

const SPINNER_TSX = `import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600', className)} />;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200 dark:bg-slate-800', className)} />;
}
`;

const MODAL_TSX = `import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
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
      {icon && <div className="mb-4 text-slate-300 dark:text-slate-600">{icon}</div>}
      <h3 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && <p className="mb-6 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action}
    </div>
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
`;

const KIT: ScaffoldFile[] = [
  { path: '/src/lib/utils.ts', content: UTILS_TS },
  { path: '/src/context/ToastContext.tsx', content: TOAST_TSX },
  { path: '/src/components/ui/Button.tsx', content: BUTTON_TSX },
  { path: '/src/components/ui/Input.tsx', content: INPUT_TSX },
  { path: '/src/components/ui/Select.tsx', content: SELECT_TSX },
  { path: '/src/components/ui/Card.tsx', content: CARD_TSX },
  { path: '/src/components/ui/Badge.tsx', content: BADGE_TSX },
  { path: '/src/components/ui/Spinner.tsx', content: SPINNER_TSX },
  { path: '/src/components/ui/Modal.tsx', content: MODAL_TSX },
  { path: '/src/components/ui/EmptyState.tsx', content: EMPTYSTATE_TSX },
  { path: '/src/components/ui/index.ts', content: UI_INDEX_TS },
];

// Files the model must NOT author — always authoritative from the scaffold.
const BASE: ScaffoldFile[] = [
  { path: '/package.json', content: PACKAGE_JSON },
  { path: '/vite.config.ts', content: VITE_CONFIG },
  { path: '/tsconfig.json', content: TSCONFIG },
  { path: '/index.html', content: INDEX_HTML },
  { path: '/src/main.tsx', content: MAIN_TSX },
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
