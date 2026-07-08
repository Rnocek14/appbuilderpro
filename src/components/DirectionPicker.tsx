// src/components/DirectionPicker.tsx
// The pre-build design-direction picker: 3 committed visual identities as live, scaled HTML
// previews (sandboxed iframes — srcdoc + allow-scripts only, never allow-same-origin). The pick
// becomes generation context the blueprint must follow, so preview ≈ build.
import { useState } from 'react';
import { Palette, ArrowRight, SkipForward, RefreshCw } from 'lucide-react';
import type { DesignDirection } from '../lib/aiClient';
import { cn } from '../lib/utils';
import { Button } from './ui';

const RISK_TONE: Record<string, string> = {
  safe: 'bg-forge-panel text-forge-dim',
  opinionated: 'bg-forge-ember/15 text-forge-ember',
  bold: 'bg-forge-err/15 text-forge-err',
};

export function DirectionPicker({ directions, onPick, onSkip, onMore, busy, loading = false, expected = 3 }: {
  directions: DesignDirection[];
  onPick: (d: DesignDirection) => void;
  onSkip: () => void;
  /** Reroll: generate 3 MORE directions from archetypes not shown yet (appended to the grid). */
  onMore?: () => void;
  busy: boolean;
  /** Directions still generating — show skeleton cards; Skip starts the build immediately. */
  loading?: boolean;
  /** How many cards this round should end with — drives the skeleton count during rerolls. */
  expected?: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="animate-fadeInUp">
      <div className="flex items-center gap-2">
        <Palette size={16} className="text-forge-ember" />
        <h2 className="font-display text-base font-semibold">Pick a design direction</h2>
      </div>
      <p className="mt-1 text-xs text-forge-dim">
        {loading
          ? 'Designing three distinct identities for your app (~30s) — or skip and start building right away.'
          : 'Three committed identities — type, color, layout, and motion move together. Your pick shapes the whole build.'}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3 stagger">
        {directions.map((d, i) => (
          <button
            key={d.name + i}
            type="button"
            onClick={() => setSelected(i)}
            className={cn(
              'group overflow-hidden rounded-xl border text-left transition-all',
              selected === i
                ? 'border-forge-ember shadow-ember'
                : 'border-forge-border hover:border-forge-ember/50 hover:shadow-lift',
            )}
          >
            {/* 1280px-designed preview scaled into the card; sandbox keeps it inert + safe.
                NO loading="lazy" (a scaled iframe in an overflow-hidden box can be judged
                "invisible" and never load) and sizes are inline styles (immune to CSS purge). */}
            <div className="relative h-[240px] overflow-hidden bg-white">
              <iframe
                title={d.name}
                srcDoc={d.preview_html}
                sandbox="allow-scripts"
                className="pointer-events-none absolute left-0 top-0"
                style={{ width: 1280, height: 960, transform: 'scale(0.25)', transformOrigin: '0 0', border: 0, background: '#fff' }}
              />
            </div>
            <div className="border-t border-forge-border p-3">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-semibold text-forge-ink">{d.name}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', RISK_TONE[d.risk] ?? RISK_TONE.safe)}>
                  {d.risk}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-forge-dim line-clamp-3">{d.brief}</p>
              <p className="mt-1.5 font-mono text-[10px] text-forge-dim/70">{d.headingFont} · {d.bodyFont}</p>
            </div>
          </button>
        ))}
        {/* Skeletons only for the slots still generating — arrived cards replace them one by one. */}
        {loading && Array.from({ length: Math.max(0, expected - directions.length) }, (_, i) => (
          <div key={`skeleton-${i}`} className="overflow-hidden rounded-xl border border-forge-border">
            <div className="skeleton h-[240px] w-full" />
            <div className="space-y-2 border-t border-forge-border p-3">
              <div className="skeleton h-3.5 w-2/5 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-3/4 rounded" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {!loading && (
          <Button
            onClick={() => selected != null && onPick(directions[selected])}
            disabled={busy || selected == null}
          >
            Build with this direction <ArrowRight size={14} />
          </Button>
        )}
        {!loading && onMore && (
          <Button
            variant="ghost"
            onClick={onMore}
            disabled={busy}
            title="Generate three more identities from different archetypes"
          >
            <RefreshCw size={13} /> Show me 3 more
          </Button>
        )}
        <Button
          variant={loading ? 'primary' : 'ghost'}
          onClick={onSkip}
          disabled={busy}
          title="Let the AI choose the design and start building now"
        >
          <SkipForward size={13} /> {loading ? 'Skip — start building now' : 'Skip — surprise me'}
        </Button>
      </div>
    </div>
  );
}
