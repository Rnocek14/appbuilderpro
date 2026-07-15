// src/components/ui/Overlay.tsx
// THE ONE OVERLAY. Every modal, sheet, and palette in the app used to hand-roll its own scrim,
// Escape handler, and (usually) forget focus-trap + body scroll-lock. This is the single primitive
// they all sit on: a tokenized backdrop (var(--gv-scrim)), Escape-to-close that only fires on the
// TOP overlay when they're nested, a real Tab focus-trap, a scroll-lock that refcounts across
// nested overlays, and focus returned to whatever opened it. It owns the scrim + the a11y
// mechanics only — the panel (paper sheet, forge modal, command bar) comes in as children, so the
// surface stays a deliberate choice, not baked in.

import { useEffect, useId, useRef, type ReactNode } from 'react';

// Shared across every mounted Overlay:
// - lockCount refcounts body scroll-lock so a nested overlay closing doesn't unlock too early
// - escStack orders the open overlays so Escape only closes the topmost one
let lockCount = 0;
let savedOverflow = '';
const escStack: string[] = [];

function lockScroll() {
  if (lockCount === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  lockCount++;
}
function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = savedOverflow;
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Overlay({
  onClose,
  children,
  placement = 'center',
  z = 70,
  closeOnBackdrop = true,
  bare = false,
  className,
}: {
  onClose: () => void;
  children: ReactNode;
  placement?: 'center' | 'top';
  z?: number;
  closeOnBackdrop?: boolean;
  /** No backdrop dim/blur — for a sheet that opens over an already-dimmed overlay (nested). */
  bare?: boolean;
  className?: string;
}) {
  const scrimRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const id = useId();

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    lockScroll();
    escStack.push(id);

    // Pull focus into the overlay — first focusable child, else the scrim itself.
    const root = scrimRef.current;
    const first = root?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root)?.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (escStack[escStack.length - 1] === id) { e.stopPropagation(); onClose(); }
        return;
      }
      if (e.key === 'Tab' && root) {
        const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (items.length === 0) { e.preventDefault(); root.focus(); return; }
        const firstEl = items[0], lastEl = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === firstEl || !root.contains(active))) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && active === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    // Capture phase so the topmost overlay wins Escape before any consumer handler underneath.
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      unlockScroll();
      const i = escStack.indexOf(id); if (i >= 0) escStack.splice(i, 1);
      restoreTo.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={scrimRef}
      className={`gv-ov ${placement}${bare ? ' bare' : ''}${className ? ` ${className}` : ''}`}
      style={{ zIndex: z }}
      tabIndex={-1}
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      {children}
    </div>
  );
}
