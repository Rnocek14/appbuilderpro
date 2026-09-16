// src/components/garvis/HuntReadiness.tsx
// THE "IS THIS SET UP?" LIGHT. One glance answers "can I search for businesses and email them right
// now?" — with the exact fix for anything missing, so the owner never wonders why a search produced
// nothing (the app-address silent blocker especially). Three honest gates: search+build, send, and
// searching every day on its own. Read-only; it never changes anything.
//
// It used to open as seven red rows of environment-variable instructions, sitting above the actual
// work on whatever page it appeared on — preamble, in the machine's vocabulary, for a problem the
// owner had no way to fix from inside the app. Now that Start here can set every one of them, this
// is one sentence and a link, and the detail is a disclosure. When everything is set it is a single
// green line.

import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Radar, Check, X, Loader2, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchHuntReadiness } from '../../lib/garvis/huntReadinessRun';
import { readinessLine, type Readiness, type ReadinessNeed } from '../../lib/garvis/huntReadiness';
import { probePlacesKey, type PlacesProbe } from '../../lib/garvis/systemControl';

const GATE_LABEL: Record<ReadinessNeed, string> = {
  hunt: 'Find businesses and build them a site',
  send: 'Email them, once you approve it',
  auto: 'Do it every day on its own',
};

export function HuntReadiness() {
  const [r, setR] = useState<Readiness | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [probe, setProbe] = useState<PlacesProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const runProbe = async () => { setProbing(true); setProbe(await probePlacesKey()); setProbing(false); };

  useEffect(() => {
    let live = true;
    void fetchHuntReadiness().then((res) => { if (live) setR(res); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : 'Could not read readiness.'); });
    return () => { live = false; };
  }, []);

  if (err) return null; // the panel is advisory; a probe failure shouldn't shout on the Health page
  if (!r) return (
    <p className="flex items-center gap-2 text-xs text-forge-dim">
      <Loader2 size={12} className="animate-spin" /> Checking what's set up…
    </p>
  );

  const gates: { need: ReadinessNeed; ok: boolean }[] = [
    { need: 'hunt', ok: r.canHunt },
    { need: 'send', ok: r.canSend },
    { need: 'auto', ok: r.canAutoHunt },
  ];
  const allGood = r.canHunt && r.canSend && r.canAutoHunt;

  const missing = r.items.filter((i) => !i.ok);

  // Everything is set up: one green line, no panel, no grid. A working state should take up almost
  // no room — the page's actual work is what deserves the space.
  if (allGood) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-forge-ok">
        <Check size={13} /> {readinessLine(r)}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-forge-ember/30 bg-forge-ember/[0.04] p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Radar size={14} className="translate-y-0.5 text-forge-ember" />
        <p className="min-w-0 flex-1 text-[13px] text-forge-ink">{readinessLine(r)}</p>
        <NavLink to="/garvis/start" className="shrink-0 text-xs font-medium text-forge-ember hover:underline">
          Open Start here →
        </NavLink>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer list-none text-[11px] text-forge-dim transition-colors hover:text-forge-ink">
          <span className="underline decoration-dotted underline-offset-2">
            What {missing.length === 1 ? 'the missing piece is' : `the ${missing.length} missing pieces are`}
          </span>
        </summary>

        {/* What each of the three things needs, and which of them already work. */}
        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {gates.map((g) => (
            <div key={g.need} className={cn('flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]',
              g.ok ? 'border-forge-ok/30 text-forge-ok' : 'border-forge-ember/30 text-forge-ember')}>
              {g.ok ? <Check size={12} className="mt-0.5 shrink-0" /> : <X size={12} className="mt-0.5 shrink-0" />}
              <span className="text-forge-ink">{GATE_LABEL[g.need]}</span>
            </div>
          ))}
        </div>

        <ul className="mt-2 space-y-1">
          {missing.map((i) => (
            <li key={i.key} className="flex items-start gap-1.5 text-[11px]">
              <X size={11} className="mt-0.5 shrink-0 text-forge-ember" />
              <span><span className="font-medium text-forge-ink">{i.label}</span> <span className="text-forge-dim">— {i.fix}</span></span>
            </li>
          ))}
        </ul>

        {/* The presence checks above can't tell a VALID Google key from an expired or over-quota one
            that silently fails every search. This actually calls Google — so it is only worth
            offering when there is a key to test. */}
        {r.items.find((i) => i.key === 'finder')?.ok && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-forge-border pt-2">
            <button onClick={() => void runProbe()} disabled={probing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1 text-[11px] font-medium text-forge-dim transition-colors hover:border-forge-ember/50 hover:text-forge-ink disabled:opacity-50">
              {probing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Check Google's key really works
            </button>
            {probe && (
              <span className={cn('inline-flex items-start gap-1 text-[11px]', probe.ok ? 'text-forge-ok' : 'text-forge-ember')}>
                {probe.ok ? <Check size={12} className="mt-0.5 shrink-0" /> : <X size={12} className="mt-0.5 shrink-0" />}
                <span>{probe.reason}</span>
              </span>
            )}
          </div>
        )}
      </details>
    </div>
  );
}
