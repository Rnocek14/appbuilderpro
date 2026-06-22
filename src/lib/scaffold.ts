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
          borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
          fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
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
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], className)}
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
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
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
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card text-card-foreground shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
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

// Theme hook — dark mode via a `.dark` class on <html>, persisted to localStorage and
// defaulting to the OS preference. A pre-paint script in index.html applies it before render
// to avoid a flash; this hook keeps React in sync and exposes a toggle.
const THEME_TS = `import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;
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
