// src/components/garvis/LabBench.tsx
// The LAB BENCH — where a branch stops being prose and becomes something you can manipulate.
// v1 is deliberately deterministic: known equations + arithmetic over dials the USER sets (lab.ts,
// verified). The honesty layer is part of the layout, not a footnote: the basis (where the math
// comes from), the assumptions (what's taken as given), and the limits (what is NOT modeled) render
// beside every result. A saved run is a reproducible simulation record on this exact branch —
// clicking a past run loads its dials back in (duplicate & tweak).

import { useMemo, useState } from 'react';
import { FlaskConical, Save, Check, History } from 'lucide-react';
import {
  SIM_TEMPLATES, simTemplateById, suggestTemplate, clampValues, sensitivity,
  simRecordArtifact, parseSimRecord, fmtSimValue, type SimTemplate,
} from '../../lib/garvis/lab';
import { SimVisual } from './SimVisual';
import type { Artifact, Cluster } from '../../lib/garvis/clustering';

const defaultsFor = (t: SimTemplate): Record<string, number> =>
  Object.fromEntries(t.params.map((p) => [p.key, p.def]));

export function LabBench({ cluster, onSave }: { cluster: Cluster; onSave: (a: Artifact) => void }) {
  const [template, setTemplate] = useState<SimTemplate>(() => suggestTemplate(`${cluster.title} ${cluster.summary}`));
  const [values, setValues] = useState<Record<string, number>>(() => defaultsFor(template));
  const [savedId, setSavedId] = useState<string | null>(null);

  const clamped = useMemo(() => clampValues(template, values), [template, values]);
  const outputs = useMemo(() => template.compute(clamped), [template, clamped]);
  const sens = useMemo(() => sensitivity(template, clamped), [template, clamped]);
  const runs = useMemo(
    () => cluster.artifacts.filter((a) => a.kind === 'simulation').map((a) => ({ a, rec: parseSimRecord(a.detail) })).filter((r) => r.rec),
    [cluster.artifacts],
  );

  // GUESS FIRST (the hypercorrection effect): commit a number before the reveal — being wrong by
  // a surprising margin is what makes the real value stick. Purely optional; never blocks the dials.
  // `actual` is snapshotted at the moment of reveal — the verdict must judge the guess against the
  // number that was hidden, not against wherever the dials sit later.
  const [guess, setGuess] = useState<{ armed: boolean; text: string; revealed: boolean; actual: number | null }>({ armed: false, text: '', revealed: false, actual: null });

  const pick = (t: SimTemplate) => { setTemplate(t); setValues(defaultsFor(t)); setSavedId(null); setGuess((g) => ({ ...g, text: '', revealed: false, actual: null })); };
  const loadRun = (rec: NonNullable<ReturnType<typeof parseSimRecord>>) => {
    const t = simTemplateById(rec.templateId);
    if (!t) return;
    setTemplate(t); setValues({ ...rec.values }); setSavedId(null);
  };
  const save = () => {
    const a = simRecordArtifact(template, clamped);
    onSave(a);
    setSavedId(a.id);
  };

  const primary = outputs[0];

  return (
    <div className="ku-rise mt-5 rounded-2xl border border-forge-border bg-forge-panel/50 p-4 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FlaskConical size={15} className="text-cyan-300" />
        <span className="text-sm font-semibold text-forge-ink">Lab bench</span>
        <span className="rounded-full border border-forge-border px-2 py-0.5 text-[9px] uppercase tracking-wide text-forge-dim" title={template.basis}>
          {template.modelType === 'equation' ? 'known equation' : 'your model — arithmetic on your assumptions'}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {SIM_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => pick(t)} title={t.tagline}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${t.id === template.id ? 'border-cyan-400/60 text-forge-ink' : 'border-forge-border text-forge-dim hover:text-forge-ink'}`}>
              {t.title}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-forge-dim">{template.tagline}</p>
      <p className="mt-1 text-[11px] text-forge-dim/70"><span className="text-forge-dim">Basis:</span> {template.basis}</p>

      {/* THE MECHANISM — animated from the SAME clamped values + outputs as the readout below.
          Drag a dial and watch the physics (or the arithmetic) respond; nothing moves that the
          model didn't compute. Hidden while a guess is pending — the animation prints the answer. */}
      {guess.armed && !guess.revealed ? (
        <div className="mt-4 flex items-center justify-center rounded-xl border border-dashed border-forge-border py-10 text-xs text-forge-dim">
          mechanism hidden until you commit a guess — the picture gives the number away
        </div>
      ) : (
        <SimVisual template={template} values={clamped} outputs={outputs} />
      )}

      <div className="mt-4 grid gap-5 md:grid-cols-[1fr_1fr]">
        {/* THE DIALS — yours. The model takes these as given; it cannot validate them. */}
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-forge-dim/70">you set these</div>
          <div className="space-y-3">
            {template.params.map((p) => (
              <div key={p.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="text-forge-dim">{p.label}</span>
                  <span className="font-mono text-forge-ink">{p.unit === '$' ? '$' : ''}{clamped[p.key].toLocaleString('en-US')}{p.unit && p.unit !== '$' ? ` ${p.unit}` : ''}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* PUSH TO THE EDGE — the physicist's limiting-case trick, one tap per end. */}
                  <button onClick={() => { setValues((v) => ({ ...v, [p.key]: p.min })); setSavedId(null); }}
                    title={`Snap to the minimum (${p.min}) — watch the limiting case`}
                    className="rounded border border-forge-border px-1 text-[9px] text-forge-dim hover:text-cyan-300">min</button>
                  <input
                    type="range" min={p.min} max={p.max} step={p.step} value={clamped[p.key]}
                    onChange={(e) => { setValues((v) => ({ ...v, [p.key]: Number(e.target.value) })); setSavedId(null); }}
                    className="w-full accent-[#22d3ee]"
                  />
                  <button onClick={() => { setValues((v) => ({ ...v, [p.key]: p.max })); setSavedId(null); }}
                    title={`Snap to the maximum (${p.max}) — watch what breaks`}
                    className="rounded border border-forge-border px-1 text-[9px] text-forge-dim hover:text-cyan-300">max</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* THE RESULT — computed, never estimated. Nulls stay null. */}
        <div>
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-forge-dim/70">
            <span>the model computes</span>
            <button
              onClick={() => setGuess((g) => ({ armed: !g.armed, text: '', revealed: false, actual: null }))}
              title="Commit a guess before you look — being surprised is how the real number sticks"
              className={`rounded border px-1.5 py-0.5 text-[9px] normal-case tracking-normal ${guess.armed ? 'border-cyan-400/50 text-cyan-300' : 'border-forge-border text-forge-dim hover:text-forge-ink'}`}
            >
              guess first
            </button>
          </div>
          <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
            <div className="text-[11px] text-forge-dim">{primary.label}</div>
            {guess.armed && !guess.revealed ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-2xl text-forge-dim/50" aria-label="hidden until you guess">•••</span>
                <input
                  autoFocus value={guess.text} inputMode="decimal" placeholder="your guess"
                  onChange={(e) => setGuess((g) => ({ ...g, text: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') setGuess((g) => ({ ...g, revealed: true, actual: primary.value })); }}
                  className="w-28 rounded-lg border border-forge-border bg-forge-bg px-2 py-1 font-mono text-sm text-forge-ink focus:border-cyan-400/60 focus:outline-none"
                />
                <button onClick={() => setGuess((g) => ({ ...g, revealed: true, actual: primary.value }))}
                  className="rounded-lg border border-cyan-400/40 px-2 py-1 text-[11px] text-forge-ink hover:bg-cyan-400/10">reveal</button>
              </div>
            ) : (
              <>
                <div className="font-mono text-2xl text-forge-ink">{fmtSimValue(primary)}</div>
                {guess.armed && guess.revealed && (() => {
                  const g = guess.text.trim() === '' ? NaN : Number(guess.text); // Number('') is 0 — an empty box is no guess
                  if (!Number.isFinite(g) || guess.actual === null) return <div className="mt-0.5 text-[10px] text-forge-dim">no comparable guess committed</div>;
                  const off = guess.actual !== 0 ? Math.abs(g - guess.actual) / Math.abs(guess.actual) * 100 : null;
                  return (
                    <div className={`mt-0.5 text-[10px] ${off !== null && off <= 20 ? 'text-forge-ok' : 'text-forge-warn'}`}>
                      you guessed {g} — {off === null ? 'actual is 0' : off <= 20 ? `within ${off.toFixed(0)}% — well calibrated` : `off by ${off.toFixed(0)}% — the surprising ones stick hardest`}
                    </div>
                  );
                })()}
              </>
            )}
            {primary.note && <div className="mt-0.5 text-[10px] text-forge-dim/70">{primary.note}</div>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {outputs.slice(1).map((o) => (
              <div key={o.key} className="rounded-lg border border-forge-border px-2.5 py-2">
                <div className="text-[10px] text-forge-dim">{o.label}</div>
                {/* while a guess is pending, EVERY output masks — the secondary cards would
                    leak the primary (home-years = traveler-years × γ) */}
                <div className="font-mono text-sm text-forge-ink">{guess.armed && !guess.revealed ? '•••' : fmtSimValue(o)}</div>
                {o.note && <div className="text-[9px] text-forge-dim/60">{o.note}</div>}
              </div>
            ))}
          </div>

          {sens.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-forge-dim/70" title="Each dial bumped +10%, model recomputed — a measurement of THIS model, not a market prediction">
                what moves this result (+10% each dial)
              </div>
              <div className="space-y-1">
                {sens.slice(0, 4).map((s) => (
                  <div key={s.key} className="flex items-center gap-2 text-[11px]">
                    <span className="w-40 truncate text-forge-dim">{s.label}</span>
                    {/* direction, not valence: a decrease isn't a "warning" (amber), it's just the other direction */}
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-forge-raised">
                      <div className="h-full rounded" style={{ width: `${Math.min(100, Math.abs(s.deltaPct) * 4)}%`, background: s.deltaPct >= 0 ? '#4ADE80' : '#38bdf8' }} />
                    </div>
                    <span className="w-14 text-right font-mono text-forge-ink">{s.deltaPct > 0 ? '+' : ''}{s.deltaPct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* the honesty layer, in the layout — not a tooltip */}
      <div className="mt-4 grid gap-3 text-[11px] md:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-forge-dim/60">taken as given</div>
          <ul className="space-y-0.5 text-forge-dim">{template.assumptions.map((a) => <li key={a}>· {a}</li>)}</ul>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-forge-warn/70">not modeled</div>
          <ul className="space-y-0.5 text-forge-dim">{template.limits.map((l) => <li key={l}>· {l}</li>)}</ul>
        </div>
      </div>

      {/* ANCHORED TO THE KNOWN — real reference points that give the numbers scale, each labeled
          for what it is (a measurement, a reported range, a long-run average). */}
      {template.anchors && template.anchors.length > 0 && (
        <div className="mt-3 text-[11px]">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-cyan-300/70">anchored to the known</div>
          <ul className="space-y-0.5 text-forge-dim">{template.anchors.map((a) => <li key={a}>◈ {a}</li>)}</ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-forge-border pt-3">
        <button onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 px-3 py-1.5 text-xs text-forge-ink transition-colors hover:bg-cyan-400/10">
          {savedId ? <Check size={12} className="text-forge-ok" /> : <Save size={12} />} {savedId ? 'Saved to this branch' : 'Save this run'}
        </button>
        {runs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <History size={11} className="text-forge-dim/60" />
            {runs.slice(-4).map(({ a, rec }) => (
              <button key={a.id} onClick={() => loadRun(rec!)} title={`${a.title} — click to load these dials back in`}
                className="max-w-[240px] truncate rounded-full border border-forge-border px-2.5 py-1 text-[10px] text-forge-dim hover:text-forge-ink">
                {a.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
