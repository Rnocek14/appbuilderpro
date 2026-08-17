// src/pages/Field.tsx  (/garvis/field — behind the door chip on Command until the 10.10 checkpoint)
// THE FIELD — one glance at every business as an orb: warn=needs-you, ember=working, green=news,
// dim=quiet. Zero input: it renders the real state on open. Touch an orb to go to that world;
// the approvals whisper links the one place decisions happen. Honest at the edges: a fresh
// account gets the ONE next step, and a load failure says so instead of posing as a quiet field.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { loadField, type FieldSnapshot } from '../lib/garvis/fieldRun';
import { cn } from '../lib/utils';

const ORB: Record<string, { dot: string; ring: string; label: string }> = {
  warn: { dot: 'bg-forge-warn', ring: 'border-forge-warn/60 shadow-[0_0_24px_-6px_var(--tw-shadow-color)] shadow-amber-500/40', label: 'needs you' },
  ember: { dot: 'bg-forge-ember', ring: 'border-forge-ember/60 shadow-[0_0_24px_-6px_var(--tw-shadow-color)] shadow-orange-500/40', label: 'working' },
  green: { dot: 'bg-emerald-400', ring: 'border-emerald-400/60 shadow-[0_0_24px_-6px_var(--tw-shadow-color)] shadow-emerald-500/30', label: 'news' },
  dim: { dot: 'bg-forge-dim/50', ring: 'border-forge-border', label: 'quiet' },
};

export default function Field() {
  const navigate = useNavigate();
  const [snap, setSnap] = useState<FieldSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void loadField().then((s) => { if (live) setSnap(s); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-lg font-medium text-forge-ink">The Field</h1>
        <p className="mt-0.5 text-xs text-forge-dim">Every business at a glance — touch one to step in.</p>

        {failed && (
          <p className="mt-6 text-sm text-forge-warn">Couldn’t load the field — a load error, not a quiet day. Try again in a moment.</p>
        )}
        {!failed && !snap && (
          <div className="mt-10 grid place-items-center"><Loader2 size={20} className="animate-spin text-forge-ember" /></div>
        )}
        {snap && snap.worlds.length === 0 && (
          <div className="mt-10 text-center">
            <p className="text-sm text-forge-dim">No businesses yet — the field lights up as soon as one exists.</p>
            <button onClick={() => navigate('/garvis/webs')}
              className="mt-3 rounded-lg bg-forge-ember px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Start your first business
            </button>
          </div>
        )}

        {snap && snap.worlds.length > 0 && (
          <>
            <div className="mt-8 flex flex-wrap justify-center gap-6">
              {snap.worlds.map((w) => {
                const o = ORB[w.state];
                return (
                  <button key={w.id} onClick={() => navigate(`/garvis/webs/${w.id}`)}
                    title={`${w.title} — ${o.label}`}
                    className={cn('group flex w-36 flex-col items-center gap-2 rounded-2xl border bg-forge-panel/40 px-3 py-5 transition-transform hover:scale-[1.03]', o.ring)}>
                    <span className={cn('h-10 w-10 rounded-full', o.dot, w.state === 'ember' && 'animate-pulse')} />
                    <span className="max-w-full truncate text-[13px] font-medium text-forge-ink">{w.title}</span>
                    <span className="text-[11px] text-forge-dim">{w.line}</span>
                  </button>
                );
              })}
            </div>
            {snap.whisper && (
              <button onClick={() => navigate('/garvis/queue')}
                className="mx-auto mt-8 block text-center text-xs text-forge-warn transition-colors hover:text-forge-ink">
                {snap.whisper} →
              </button>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
