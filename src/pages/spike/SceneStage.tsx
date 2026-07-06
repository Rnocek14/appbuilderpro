// src/pages/spike/SceneStage.tsx
// THE STAGE — an idea rendered as a PLACE you walk into, full-canvas and cinematic, not a card you
// read. This is the anti-dashboard: full-bleed hero, display-scale typography, a palette pulled from
// the idea, and a guess→reveal that lands with FORCE (flash + scale-in + count-up), not a fade.
// Each recipe (flip / bigNumber / mystery / reveal) stages differently so no two ideas feel alike.
// The map is the zoom-out; this is where you stand. (Rabbit-hole doctrine: name the gap → hold the
// answer → reveal hard → open the next gap. Currents ring the bottom as the pull forward.)

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Compass, Hammer, HelpCircle, Loader2, Lock, Sparkles, Flame, Play } from 'lucide-react';
import type { Cluster, Lead, LeadKind, Scene } from '../../lib/garvis/clustering';

export interface StageCurrent { lead: Lead; ready: boolean; epiphany: number }

interface Props {
  focus: Cluster;
  scene: Scene | null;
  composing: boolean;
  partial: string;
  hex: string;
  trail: string[];
  heroUrl?: string;
  gallery: { url: string; thumb: string; title: string; video?: boolean }[];
  currents: StageCurrent[];
  onGuess: (i: number) => void;
  onDive: (lead: Lead) => void;
  onOpenMedia: (m: { url: string; title: string; video?: boolean }) => void;
  onConstellation: () => void;
  onDetails?: () => void;
  onBuild?: () => void;
}

// harmonized with GalaxyView — warm dig, one cool question-blue, one violet tangent
const LEAD_HEX: Record<LeadKind, string> = { dig: '#F2A44D', question: '#5AA9E6', tangent: '#B98CE0' };

// pull the numeric part out of "200,000" / "~1.4 billion" for the count-up (keeps prefix/suffix)
function splitNumber(v: string): { pre: string; num: number; post: string } | null {
  const m = /^(\D*)([\d,.]+)(.*)$/.exec(v.trim());
  if (!m) return null;
  const num = parseFloat(m[2].replace(/,/g, ''));
  if (!Number.isFinite(num)) return null;
  return { pre: m[1], num, post: m[3] };
}

// Ambient media strip flanking the question text on wide screens — quiet, dimmed, hover to full.
function SideMedia({ items, side, onOpen }: {
  items: { url: string; thumb: string; title: string; video?: boolean }[];
  side: 'left' | 'right';
  onOpen: (m: { url: string; title: string; video?: boolean }) => void;
}) {
  if (!items.length) return null;
  return (
    <div className={`pointer-events-none absolute top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 lg:flex ${side === 'left' ? 'left-4 xl:left-8' : 'right-4 xl:right-8'}`}>
      {items.map((m, i) => (
        <button key={i} onClick={() => onOpen(m)} title={m.title}
          className="stg-in pointer-events-auto group relative h-28 w-40 overflow-hidden rounded-2xl border border-white/12 bg-black/30 shadow-2xl backdrop-blur transition-transform hover:scale-[1.06] xl:h-32 xl:w-48"
          style={{ animationDelay: `${300 + i * 130}ms` }}>
          <img src={m.thumb} alt="" loading="lazy" className="h-full w-full object-cover opacity-75 transition-opacity group-hover:opacity-100" />
          {m.video && <span className="absolute inset-0 flex items-center justify-center bg-black/30"><Play size={20} className="text-white/90" /></span>}
          {m.title && <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-[10px] text-white/80">{m.title}</span>}
        </button>
      ))}
    </div>
  );
}

function CountUp({ value, hex }: { value: string; hex: string }) {
  const parsed = splitNumber(value);
  const [n, setN] = useState(parsed ? 0 : -1);
  useEffect(() => {
    if (!parsed) return;
    const start = performance.now();
    const dur = 1300;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setN(parsed.num * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  if (!parsed) return <span style={{ color: hex }}>{value}</span>;
  const shown = parsed.num >= 1000 ? Math.round(n).toLocaleString() : (Math.round(n * 10) / 10).toString();
  return <span style={{ color: hex, textShadow: `0 0 40px ${hex}88` }}>{parsed.pre}{shown}{parsed.post}</span>;
}

export default function SceneStage({ focus, scene, composing, partial, hex, trail, heroUrl, gallery, currents, onGuess, onDive, onOpenMedia, onConstellation, onDetails, onBuild }: Props) {
  const revealed = !!scene && scene.guessed !== undefined;
  const recipe = scene?.recipe ?? 'reveal';
  const mystery = recipe === 'mystery';
  const justGuessed = useRef(false);
  const [flash, setFlash] = useState(false);
  const [shown, setShown] = useState(() => (revealed ? 99 : 0));

  useEffect(() => {
    if (!revealed || !scene) { setShown(0); justGuessed.current = false; return; }
    if (!justGuessed.current) { setShown(99); return; } // revisit: whole room at once
    setShown(0);
    const iv = window.setInterval(() => setShown((s) => (s >= scene.beats.length + 1 ? s : s + 1)), 900);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, focus.id]);

  const guess = (i: number) => {
    justGuessed.current = true;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 620);
    onGuess(i);
  };

  const legacy = !scene && !composing;
  const understanding = focus.artifacts.find((a) => a.id === 'understanding');
  const correct = scene && scene.guessed !== undefined && scene.guessed !== -1 && scene.guessed === scene.answerIndex;
  const reaction = scene && revealed && scene.guessed !== -1 ? (correct ? 'You called it — and it goes deeper.' : 'Close — the truth is stranger.') : null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes stg-kb { from { transform: scale(1.06) } to { transform: scale(1.2) } }
        @keyframes stg-rise { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        @keyframes stg-in { from { opacity:0; transform:scale(.94); filter:blur(10px) } to { opacity:1; transform:none; filter:blur(0) } }
        @keyframes stg-flash { 0% { opacity:0 } 22% { opacity:.65 } 100% { opacity:0 } }
        @keyframes stg-drift { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-10px) } }
        /* one easing across the whole product — the forge signature curve (matches tailwind.config) */
        .stg-kb { animation: stg-kb 26s ease-in-out infinite alternate; }
        .stg-rise { animation: stg-rise .55s cubic-bezier(0.22,1,0.36,1) both; }
        .stg-in { animation: stg-in .6s cubic-bezier(0.22,1,0.36,1) both; }
        .stg-drift { animation: stg-drift 7s ease-in-out infinite; }
        .stg-strike { position:relative; }
        .stg-strike::after { content:''; position:absolute; left:0; top:52%; height:3px; width:100%; background:currentColor; transform:scaleX(0); transform-origin:left; animation: stg-strk .5s .1s ease-out forwards; }
        @keyframes stg-strk { to { transform:scaleX(1) } }
        /* film grain — subtle, desaturated fractal noise; overlay-blended so it textures the backdrop
           (kills the flat digital look) without touching text legibility. */
        .stg-grain { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E"); background-size: 140px 140px; opacity: .07; mix-blend-mode: overlay; }
      `}</style>

      {/* ---- HERO: the idea has a face, and a mood. The source photo is color-GRADED into the forge
           palette (duotone lean) so any image — good or ugly, warm or cold — reads as one cohesive,
           cinematic world, and the graded dark guarantees the text stays legible on top. ---- */}
      <div className="pointer-events-none absolute inset-0">
        {heroUrl ? (
          <>
            <img src={heroUrl} alt="" className="stg-kb h-full w-full object-cover" style={{ opacity: mystery ? 0.2 : revealed ? 0.72 : 0.6 }} />
            {/* crush the shadows into the deep blue-black base */}
            <div className="absolute inset-0" style={{ background: '#0C0E13', mixBlendMode: 'multiply', opacity: 0.5 }} />
            {/* tint the midtones/highlights toward the idea's color — the duotone lean */}
            <div className="absolute inset-0" style={{ background: `linear-gradient(140deg, ${hex} 0%, #0C0E13 82%)`, mixBlendMode: 'overlay', opacity: 0.6 }} />
          </>
        ) : (
          <div className="h-full w-full" style={{ background: `radial-gradient(1200px 700px at 30% 25%, ${hex}44, transparent 70%)` }} />
        )}
        {/* living color wash + cinematic vignette + legibility floor (stronger at the bottom, where
            the bottom-anchored content lives) */}
        <div className="absolute inset-0" style={{ background: `radial-gradient(1100px 800px at 22% 30%, ${hex}22, transparent 60%)` }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 120% at 50% 40%, transparent 40%, rgba(6,5,9,0.85) 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(6,5,9,0.97) 12%, rgba(6,5,9,0.72) 38%, rgba(6,5,9,0.34) 66%, rgba(6,5,9,0.55))' }} />
        {/* film grain, on top of the grade — the cheap "expensive" trick */}
        <div className="stg-grain absolute inset-0" />
      </div>

      {/* the reveal punch — a one-shot flash of the idea's color */}
      {flash && <div className="pointer-events-none absolute inset-0 z-30" style={{ animation: 'stg-flash .62s ease-out forwards', background: `radial-gradient(circle at 50% 45%, ${hex}, transparent 60%)` }} />}

      {/* ---- top bar: zoom out + how you got here ---- */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 p-4">
        <button onClick={onConstellation} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur transition-colors hover:border-white/40 hover:text-white">
          <Compass size={13} /> constellation
        </button>
        {trail.length > 0 && (
          <div className="flex min-w-0 items-center gap-1 truncate text-[11px] text-white/45">
            {trail.map((t, i) => <span key={i} className="truncate">{i > 0 && <span className="mx-1 text-white/25">·</span>}{t}</span>)}
          </div>
        )}
        {(onBuild || onDetails) && (
          <div className="ml-auto flex items-center gap-2">
            {onBuild && (
              <button onClick={onBuild} title="Turn this idea into an app"
                className="inline-flex items-center gap-1.5 rounded-full border border-forge-ember/50 bg-forge-ember/15 px-3 py-1.5 text-[11px] font-semibold text-forge-ember backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-forge-ember/25" style={{ boxShadow: '0 0 22px -8px #FF8A3D' }}>
                <Hammer size={12} /> Build this
              </button>
            )}
            {onDetails && (
              <button onClick={onDetails} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur transition-colors hover:border-white/40 hover:text-white">
                <BookOpen size={12} /> details
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- SIDE MEDIA RAILS: during the QUESTION (and while composing), real photos/videos flank
           the text so the gap feels alive instead of a bare quiz. The reveal has its own inline
           gallery, so these are gap/composing-only to avoid showing the same media twice. Wide
           screens only — on narrow the text column needs the full width. ---- */}
      {(composing || (scene && !revealed)) && gallery.length > 0 && (
        <>
          <SideMedia items={gallery.filter((_, i) => i % 2 === 0).slice(0, 3)} side="left" onOpen={onOpenMedia} />
          <SideMedia items={gallery.filter((_, i) => i % 2 === 1).slice(0, 3)} side="right" onOpen={onOpenMedia} />
        </>
      )}

      {/* ---- CENTER STAGE: bottom-anchored, but scrolls cleanly when a reveal runs long.
           `mt-auto` (not `justify-end`) bottom-aligns short content yet collapses to 0 when content
           overflows — so tall reveals scroll from the top instead of stacking on themselves. The big
           bottom padding clears the currents rail so text never lands under it. ---- */}
      <div className="panel-scroll absolute inset-0 z-10 flex flex-col overflow-y-auto px-6 pt-24 sm:px-12" style={{ paddingBottom: currents.length ? 260 : 128 }}>
        <div className="mx-auto mt-auto w-full max-w-3xl">

          {/* COMPOSING — the gap materializes as big type, not a spinner */}
          {composing && !scene && (
            partial
              ? <p className="stg-rise font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">{partial}<span className="ml-1 inline-block h-7 w-1.5 animate-pulse align-middle" style={{ background: hex }} /></p>
              : <div className="flex items-center gap-2 text-sm text-white/60"><Loader2 size={15} className="animate-spin" /> Garvis is walking into this idea…</div>
          )}

          {/* LEGACY — no scene, show the prose room. One voice: the summary is the lede only when the
              understanding doesn't already open with it (they're often the same model sentence twice). */}
          {legacy && (
            <div className="stg-rise">
              <h1 className="font-display text-4xl font-semibold leading-tight text-white">{focus.title}</h1>
              {focus.summary && !(understanding?.detail ?? '').startsWith(focus.summary.slice(0, 40)) && (
                <p className="mt-3 text-lg text-white/85">{focus.summary}</p>
              )}
              {understanding?.detail && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/65">{understanding.detail}</p>}
            </div>
          )}

          {/* ============ THE GAP (pre-guess) ============ */}
          {scene && !revealed && (
            <div>
              {scene.prime && <p className="stg-rise text-sm uppercase tracking-wide text-white/55" style={{ animationDelay: '40ms' }}>{scene.prime}</p>}

              {recipe === 'flip' && scene.myth
                ? <p className="stg-rise mt-3 font-display text-3xl font-semibold leading-tight text-white/45 sm:text-4xl" style={{ animationDelay: '90ms' }}>{scene.myth}</p>
                : <h1 className="stg-rise mt-3 font-display text-3xl font-semibold leading-tight text-white sm:text-[2.6rem]" style={{ animationDelay: '90ms' }}>{scene.gap}</h1>}
              {recipe === 'flip' && scene.myth && <h1 className="stg-rise mt-2 font-display text-2xl font-semibold leading-tight text-white/90 sm:text-3xl" style={{ animationDelay: '150ms' }}>{scene.gap}</h1>}

              <div className="stg-rise mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium" style={{ animationDelay: '220ms', borderColor: `${hex}66`, color: hex, boxShadow: `0 0 22px -6px ${hex}` }}>
                <Lock size={11} /> Garvis is holding the answer — take a guess first
              </div>

              <div className="mt-4 grid gap-2">
                {scene.options.map((o, i) => (
                  <button key={i} onClick={() => guess(i)}
                    className="stg-rise group flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-left backdrop-blur transition-all hover:-translate-y-0.5 hover:border-white/35 hover:bg-white/[0.08]"
                    style={{ animationDelay: `${280 + i * 80}ms` }}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 text-[11px] text-white/60 group-hover:border-white/50 group-hover:text-white">{i + 1}</span>
                    <span className="text-[15px] text-white/90 group-hover:text-white">{o}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => guess(-1)} className="stg-rise mt-3 text-xs text-white/45 hover:text-white/75" style={{ animationDelay: '560ms' }}>just show me →</button>
            </div>
          )}

          {/* ============ THE REVEAL (post-guess) ============ */}
          {scene && revealed && (
            <div>
              {reaction && <p className="stg-in text-sm font-medium" style={{ color: hex }}><Sparkles size={13} className="mr-1 inline" />{reaction}</p>}

              {/* flip: the myth strikes through, the truth lands */}
              {recipe === 'flip' && scene.myth && scene.truth ? (
                <div className="mt-2">
                  <p className="stg-strike font-display text-2xl font-semibold leading-tight text-white/40 sm:text-3xl" style={{ color: '#ffffff66' }}>{scene.myth}</p>
                  <p className="stg-in mt-3 font-display text-3xl font-semibold leading-tight text-white sm:text-[2.5rem]" style={{ animationDelay: '260ms' }}>{scene.truth}</p>
                </div>
              ) : recipe === 'bigNumber' && scene.bigValue ? (
                <div className="mt-2 text-center sm:text-left">
                  <div className="stg-drift font-display text-6xl font-bold leading-none tracking-tight sm:text-8xl"><CountUp value={scene.bigValue} hex={hex} /></div>
                  {scene.bigUnit && <p className="stg-in mt-3 text-lg text-white/80" style={{ animationDelay: '300ms' }}>{scene.bigUnit}</p>}
                </div>
              ) : (
                <p className="stg-in mt-2 font-display text-2xl font-semibold leading-tight text-white sm:text-3xl">{scene.beats[0]}</p>
              )}

              {/* the remaining beats cascade in with weight. bigNumber's hero is the figure, so beat 0
                  (the explaining sentence) still cascades; flip/reveal/mystery already showed beat 0 as the hero. */}
              <div className="mt-4 space-y-3">
                {scene.beats.slice(recipe === 'bigNumber' ? 0 : 1, shown).map((b, i) => (
                  <p key={i} className="stg-in text-[15px] leading-relaxed text-white/80" style={{ animationDelay: justGuessed.current ? '0ms' : `${i * 60}ms` }}>{b}</p>
                ))}
                {shown <= scene.beats.length && justGuessed.current && <Loader2 size={14} className="animate-spin text-white/30" />}
              </div>

              {/* media emerges INSIDE the open-gap window (memory-encoding spillover) */}
              {gallery.length > 0 && (justGuessed.current ? shown > scene.beats.length : true) && (
                <div className="stg-in mt-5 flex flex-wrap gap-2">
                  {gallery.slice(0, 4).map((m, i) => (
                    <button key={i} onClick={() => onOpenMedia(m)} title={m.title}
                      className="relative h-24 w-32 overflow-hidden rounded-xl border border-white/15 transition-transform hover:scale-105">
                      <img src={m.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {m.video && <span className="absolute inset-0 flex items-center justify-center bg-black/30"><Play size={20} className="text-white/90" /></span>}
                    </button>
                  ))}
                </div>
              )}

              {/* the regap — the door that just opened */}
              {scene.regap && (!justGuessed.current || shown > scene.beats.length) && (
                <button onClick={() => onDive({ label: scene.regap, kind: 'question' })}
                  className="stg-in mt-6 flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5"
                  style={{ borderColor: `${hex}55`, background: `${hex}12`, boxShadow: `0 0 30px -14px ${hex}` }}>
                  <HelpCircle size={16} className="shrink-0" style={{ color: hex }} />
                  <span className="text-[15px] font-medium leading-snug text-white">{scene.regap}</span>
                  <ArrowRight size={15} className="ml-auto shrink-0" style={{ color: hex }} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---- CURRENTS RAIL: where this pulls you — glowing lures. Sits above the think-out-loud bar.
           Held back until the reveal: while the gap is open the guess IS the room (rabbit-hole doctrine —
           the next doors open only after this one). ---- */}
      {currents.length > 0 && (!scene || revealed) && (
        <div className="absolute inset-x-0 bottom-[68px] z-20 px-4 pb-2 pt-10" style={{ background: 'linear-gradient(to top, rgba(6,5,9,0.92) 40%, transparent)' }}>
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-[0.2em] text-white/40">
            <span className="h-1 w-1 rounded-full" style={{ background: hex }} /> where your curiosity is pulling you
          </div>
          <div className="panel-scroll flex gap-2 overflow-x-auto pb-1">
            {currents.slice(0, 6).map(({ lead, ready, epiphany }, i) => {
              const lhex = LEAD_HEX[lead.kind];
              const ep = epiphany >= 2;
              return (
                <button key={i} onClick={() => onDive(lead)} title={ready ? 'Garvis is holding this answer' : lead.label}
                  className="stg-rise group w-60 shrink-0 rounded-2xl border bg-black/40 px-3.5 py-2.5 text-left backdrop-blur transition-all hover:-translate-y-1"
                  style={{ animationDelay: `${i * 70}ms`, borderColor: ep ? '#fbbf2488' : ready ? `${lhex}88` : `${lhex}33`, boxShadow: ep ? '0 0 30px -8px #fbbf24' : ready ? `0 0 24px -8px ${lhex}` : 'none' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-medium leading-snug text-white/90 group-hover:text-white line-clamp-2">{lead.label}</span>
                    {ready && <Lock size={10} className="ml-auto shrink-0" style={{ color: lhex }} />}
                  </div>
                  {lead.tease && <p className="mt-1 line-clamp-2 text-[11px] italic leading-snug text-white/55">{lead.tease}</p>}
                  {ep && <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300"><Flame size={10} /> touches {epiphany} open questions</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
