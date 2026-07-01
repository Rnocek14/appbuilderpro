// src/lib/previewRuntime.ts
// A shared snapshot of what the live preview is actually doing — the current route,
// any uncaught error, recent console output, and a text outline of what's rendered on
// screen. PreviewPane writes to it as the iframe reports state; the chat reads from it
// so the assistant can ground its analysis in the RUNNING app, not just the source.
//
// WHY: previously only a single error string reached the model, and only when the user
// clicked "Fix with AI". The model couldn't see console warnings, the current page, or
// what's rendered — so "this page looks wrong" was answered blind. This closes that gap.

export interface PreviewLog { level: string; text: string }

export interface PreviewSnapshot {
  route: string | null;     // best-effort: location.hash / pathname inside the iframe
  title: string | null;     // document.title of the rendered app
  error: string | null;     // current uncaught error / unhandled rejection, if any
  logs: PreviewLog[];       // recent console output (capped)
  dom: string | null;       // visible text outline of what's currently rendered
  updatedAt: number;        // ms epoch of the last update (0 = never)
}

const empty: PreviewSnapshot = { route: null, title: null, error: null, logs: [], dom: null, updatedAt: 0 };
let snapshot: PreviewSnapshot = empty;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

export function subscribePreview(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getPreviewSnapshot(): PreviewSnapshot { return snapshot; }

/** Merge a partial update from the preview iframe and stamp the time. */
export function updatePreviewSnapshot(patch: Partial<PreviewSnapshot>): void {
  snapshot = { ...snapshot, ...patch, updatedAt: Date.now() };
  emit();
}

/** A new iframe (project switch / hard retry) — drop stale runtime state. */
export function resetPreviewSnapshot(): void {
  snapshot = empty;
  emit();
}

// --- Screenshot capture -----------------------------------------------------
// The live preview can rasterize its own DOM to an image (see PreviewPane's shell).
// PreviewPane registers the actual capture implementation; the chat composer calls
// captureScreenshot() to grab the current view as a data URL to attach to a message.
type CaptureFn = () => Promise<string | null>;
let captureFn: CaptureFn | null = null;

export function registerScreenshotCapture(fn: CaptureFn | null): void { captureFn = fn; }

/** Capture the current preview as a JPEG data URL, or null if unavailable/failed. */
export async function captureScreenshot(): Promise<string | null> {
  if (!captureFn) return null;
  try { return await captureFn(); } catch { return null; }
}

const MAX_LOG_LINES = 40;
const MAX_DOM_CHARS = 4000;

/** Append a console line, keeping only the most recent MAX_LOG_LINES. */
export function pushPreviewLog(log: PreviewLog): void {
  snapshot = { ...snapshot, logs: [...snapshot.logs.slice(-(MAX_LOG_LINES - 1)), log], updatedAt: Date.now() };
  emit();
}

/**
 * Format the snapshot as a prompt block the model can use to ground its analysis.
 * Returns '' when there's nothing meaningful yet, so it adds zero tokens when the
 * preview hasn't run. `staleMs` guards against feeding state from a preview that
 * hasn't updated in a long time (e.g. the tab was never opened this session).
 */
export function previewContext(staleMs = 10 * 60_000): string {
  const s = snapshot;
  const fresh = s.updatedAt > 0 && Date.now() - s.updatedAt <= staleMs;
  if (!fresh) return '';
  const hasAnything = s.error || s.dom || s.logs.length || s.route || s.title;
  if (!hasAnything) return '';

  // Surface errors/warnings first (most diagnostic), then the tail of normal logs.
  const notable = s.logs.filter((l) => l.level === 'error' || l.level === 'warn');
  const others = s.logs.filter((l) => l.level !== 'error' && l.level !== 'warn').slice(-8);
  const logLines = [...notable, ...others]
    .map((l) => `  [${l.level}] ${l.text.slice(0, 300)}`)
    .join('\n');

  const dom = s.dom ? s.dom.slice(0, MAX_DOM_CHARS) : '';

  return [
    '\n\nLIVE PREVIEW STATE — this is what the RUNNING app currently shows. Use it to ground your',
    'analysis in actual runtime behavior (correlate the user\'s description with what\'s on screen,',
    'the console, and any error). It reflects the last render; it is not the source of truth for code.',
    s.route ? `\n• Route/URL: ${s.route}` : '',
    s.title ? `\n• Page title: ${s.title}` : '',
    `\n• Uncaught error: ${s.error ? s.error.slice(0, 1200) : 'none'}`,
    logLines ? `\n• Recent console (errors/warnings first):\n${logLines}` : '\n• Recent console: (empty)',
    dom ? `\n• Rendered content (visible text, truncated):\n${dom}` : '\n• Rendered content: (nothing captured yet)',
  ].filter(Boolean).join('');
}
