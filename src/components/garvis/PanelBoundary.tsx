// src/components/garvis/PanelBoundary.tsx
// A studio panel is a leaf feature — the Farm, the mailer, the video studio, the paperwork desk.
// Some pull heavy dependencies (qrcode, pdf, docx). Historically each was STATICALLY imported into
// the Ventures page, so if one leaf dependency failed to resolve (a stale node_modules, a bad
// install) the ENTIRE page died with "Failed to fetch dynamically imported module" — no studios at
// all. This wrapper makes every heavy panel a lazy chunk behind its own error boundary: a broken
// panel shows a small honest fallback and the rest of the studio keeps working. One leaf can no
// longer take down the whole workspace.

import { Component, Suspense, type ReactNode } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

interface BoundaryProps { name: string; children: ReactNode }
interface BoundaryState { error: Error | null }

class LeafBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): BoundaryState { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="mt-4 rounded-xl border border-forge-warn/40 bg-forge-warn/5 p-3 text-xs text-forge-dim">
          <span className="inline-flex items-center gap-1.5 font-medium text-forge-warn">
            <AlertTriangle size={13} /> The {this.props.name} panel couldn’t load
          </span>
          <p className="mt-1">
            The rest of this studio still works. This is almost always a stale local install — from
            the project folder run <code className="rounded bg-forge-panel px-1 py-0.5 text-forge-ink">npm install</code> and
            hard-refresh (Ctrl/Cmd-Shift-R). It does not affect anything saved in the database.
          </p>
          <p className="mt-1 font-mono text-[10px] text-forge-dim/70">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Wrap a lazy studio panel: Suspense for the load, a leaf boundary so a failure is contained. */
export function PanelBoundary({ name, children }: { name: string; children: ReactNode }) {
  return (
    <LeafBoundary name={name}>
      <Suspense fallback={
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-forge-border bg-forge-panel/30 p-3 text-xs text-forge-dim">
          <Loader2 size={13} className="animate-spin text-forge-ember" /> Loading the {name}…
        </div>
      }>
        {children}
      </Suspense>
    </LeafBoundary>
  );
}
