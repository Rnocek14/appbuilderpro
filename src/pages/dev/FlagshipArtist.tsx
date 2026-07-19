// src/pages/dev/FlagshipArtist.tsx
// THE FLAGSHIP LANE, first artifact: a one-off, hand-choreographed scroll experience for an
// artist's imported body of work. This is the bespoke tier the 25-a-day generator deliberately
// isn't — custom chapters, art-driven palettes, real depth — reviewed by a human before it
// ships to exactly one client. Data-driven through window.__FLAGSHIP__ (the import seam): the
// artist's real pieces ride in as a manifest; nothing here is invented about the work.
//
// Chapters: title → gallery tunnel (camera dollies through the canvases) → deep zoom (into the
// brushwork) → 2.5D drift (the painting separates into depth layers) → works grid → inquire.
// All scroll-scrubbed via ScrollScene (export/reduced-motion safe by construction).

import { useEffect, useMemo, useState } from 'react';
import { ScrollScene } from '../../components/preview/scenes';

interface Piece {
  url: string;
  title: string;
  medium: string;
  year: string;
  /** dominant color of the piece, css value — drives the chapter stage behind it */
  accent: string;
  /** paper-light piece (ink drawing) vs dark canvas — captions adapt */
  light?: boolean;
}
interface Manifest {
  artist: string;
  discipline: string;
  statement: string;
  email: string;
  pieces: Piece[];
}

const FALLBACK: Manifest = {
  artist: 'Odessa Marsh',
  discipline: 'Paintings & Works on Paper',
  statement: 'Abstraction rooted in Midwestern weather — fields, storms, and the hour after they pass.',
  email: 'studio@odessamarsh.art',
  pieces: [],
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Chapter 2 — THE TUNNEL: pieces hang in z-space; scroll dollies the camera through them. */
function Tunnel({ pieces, p }: { pieces: Piece[]; p: number }) {
  const SPACING = 1000;                                   // z-distance between canvases
  // The dolly STOPS at the final canvas (flying past it left a long empty black tail —
  // first test-drive finding): p=1 leaves the last piece hanging 300px ahead of the camera.
  const camZ = p * ((pieces.length - 1) * SPACING + 900) - 600;
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0c0b0e]" style={{ perspective: '900px' }}>
      {/* the room: a faint floor line + drifting dust give the void scale */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(90% 70% at 50% 42%, rgb(34 32 38), rgb(12 11 14) 78%)' }} />
      {pieces.map((piece, i) => {
        const rel = (i + 0.6) * SPACING - camZ;            // distance ahead of the camera
        if (rel < -420 || rel > 4200) return null;         // behind us / too deep to draw
        const side = i % 2 === 0 ? -1 : 1;                 // canvases alternate off-axis
        // full-bright within arm's reach; only DEEP pieces haze down (they also blur)
        const near = rel < 800 ? 1 : clamp01(1 - (rel - 800) / 3400);
        const passing = clamp01(1 - Math.abs(rel - 340) / 340); // caption when beside the camera
        return (
          <div key={i} className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translate3d(${side * (16 + (i % 3) * 5)}vw, ${((i % 3) - 1) * 5}vh, ${-rel}px)`,
              opacity: rel < -80 ? clamp01(1 - (-rel - 80) / 320) : near,
              zIndex: 100 - i,
            }}>
            <div className="relative" style={{ filter: `blur(${clamp01((rel - 1500) / 2600) * 5}px)` }}>
              <img src={piece.url} alt={piece.title}
                className="max-h-[58vh] w-auto max-w-[38vw] border-[10px] border-[#f4f1ea] shadow-2xl"
                style={{ boxShadow: `0 40px 80px -20px rgb(0 0 0 / 0.7), 0 0 120px -30px ${piece.accent}` }} />
              <div className="absolute -bottom-10 left-0 text-sm tracking-wide text-white/85"
                style={{ opacity: passing, transform: `translateY(${(1 - passing) * 10}px)` }}>
                <span className="font-semibold">{piece.title}</span>
                <span className="text-white/50"> — {piece.medium}, {piece.year}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-xs uppercase tracking-[0.3em] text-white/40"
        style={{ opacity: p < 0.04 ? 1 : clamp01(1 - (p - 0.04) * 18) }}>
        Scroll to walk the gallery
      </div>
    </div>
  );
}

/** Chapter 3 — THE DEEP ZOOM: one piece grows from a framed object into pure brushwork. */
function DeepZoom({ piece, p }: { piece: Piece; p: number }) {
  const grow = easeOut(seg(p, 0, 0.72));
  const scale = 0.34 + grow * 3.1;
  const caption = seg(p, 0.78, 0.92);
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{ background: `radial-gradient(100% 80% at 50% 30%, ${piece.accent}22, #0c0b0e 75%)` }}>
      <img src={piece.url} alt={piece.title}
        className="border-[10px] border-[#f4f1ea] shadow-2xl"
        style={{
          maxHeight: '60vh', maxWidth: '40vw',
          // the dive steers via transform-origin (a translate inside the same transform fought
          // the scale and shoved the canvas off-center — first test-drive finding)
          transform: `scale(${scale})`,
          transformOrigin: '44% 38%',
          borderWidth: `${clamp01(1 - grow * 1.6) * 10}px`,
        }} />
      <div className="absolute inset-x-0 bottom-[10%] px-6 text-center"
        style={{ opacity: caption, transform: `translateY(${(1 - caption) * 22}px)` }}>
        <p className="mx-auto max-w-2xl text-2xl leading-relaxed text-white/90 sm:text-3xl" style={{ fontFamily: 'var(--fl-display)' }}>
          "{piece.title}" — up close, the weather is still moving.
        </p>
      </div>
    </div>
  );
}

/** Chapter 4 — 2.5D DRIFT: the painting separates into depth layers as you pass it. */
function DepthDrift({ piece, p }: { piece: Piece; p: number }) {
  const t = seg(p, 0.08, 0.85);
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0c0b0e]">
      {/* back layer: the piece itself, blown up, soft — the painting's own atmosphere */}
      <img src={piece.url} alt="" aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: 'blur(38px) saturate(1.15)', opacity: 0.55, transform: `scale(${1.25 - t * 0.12})` }} />
      <div className="absolute inset-0 bg-black/35" />
      {/* front layer: the sharp painting, drifting against its own depth */}
      <img src={piece.url} alt={piece.title}
        className="relative border-[10px] border-[#f4f1ea] shadow-2xl"
        style={{ maxHeight: '62vh', maxWidth: '42vw', transform: `translateY(${(1 - t) * 60 - 30}px) scale(${0.96 + t * 0.06})`, boxShadow: `0 50px 100px -20px rgb(0 0 0 / 0.8)` }} />
      <div className="absolute bottom-[9%] left-1/2 -translate-x-1/2 text-center"
        style={{ opacity: seg(p, 0.55, 0.72) }}>
        <p className="text-sm uppercase tracking-[0.25em] text-white/60">{piece.title} · {piece.medium}, {piece.year}</p>
      </div>
    </div>
  );
}

export default function FlagshipArtist() {
  const manifest: Manifest = useMemo(() => {
    const injected = (window as unknown as { __FLAGSHIP__?: Manifest }).__FLAGSHIP__;
    return injected?.pieces?.length ? injected : FALLBACK;
  }, []);
  const { pieces } = manifest;
  const [heroLoaded, setHeroLoaded] = useState(false);
  useEffect(() => {
    if (!pieces.length) return;
    const img = new Image();
    img.onload = () => setHeroLoaded(true);
    img.src = pieces[0].url;
  }, [pieces]);

  if (!pieces.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0b0e] px-8 text-center text-white/70">
        <p>Flagship preview: provide window.__FLAGSHIP__ = {'{ artist, pieces: [...] }'} — the artist's imported work drives everything here.</p>
      </div>
    );
  }
  const hero = pieces[0];
  const zoomPiece = pieces[Math.min(1, pieces.length - 1)];
  const driftPiece = pieces[Math.min(2, pieces.length - 1)];

  return (
    <div className="bg-[#0c0b0e] text-white antialiased"
      style={{ ['--fl-display' as string]: '"Cormorant Garamond", Georgia, serif', fontFamily: '"Jost", "Inter", ui-sans-serif, sans-serif' }}>
      {/* CHAPTER 1 — the name over the work's own glow */}
      <ScrollScene heightVh={170}>
        {(p) => {
          const settle = easeOut(seg(p, 0, 0.5));
          return (
            <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
              <img src={hero.url} alt="" aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
                style={{ filter: `blur(${46 - settle * 30}px) brightness(${0.5 + settle * 0.28})`, transform: `scale(${1.3 - settle * 0.18})`, opacity: heroLoaded ? 1 : 0, transition: 'opacity 0.8s' }} />
              <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 55%, transparent 30%, rgb(12 11 14 / 0.88) 80%)' }} />
              <p className="relative text-xs uppercase tracking-[0.4em] text-white/60" style={{ opacity: settle }}>{manifest.discipline}</p>
              <h1 className="relative mt-4 text-center font-medium leading-none"
                style={{ fontFamily: 'var(--fl-display)', fontSize: 'clamp(3.4rem, 11vw, 10rem)', letterSpacing: '-0.01em',
                  opacity: 0.25 + settle * 0.75, transform: `translateY(${(1 - settle) * 30}px)` }}>
                {manifest.artist}
              </h1>
              <p className="relative mt-6 max-w-xl px-6 text-center text-white/70" style={{ opacity: seg(p, 0.3, 0.55) }}>
                {manifest.statement}
              </p>
            </div>
          );
        }}
      </ScrollScene>

      {/* CHAPTER 2 — the tunnel */}
      <ScrollScene heightVh={140 + pieces.length * 60}>
        {(p) => <Tunnel pieces={pieces} p={p} />}
      </ScrollScene>

      {/* CHAPTER 3 — the deep zoom */}
      <ScrollScene heightVh={230}>
        {(p) => <DeepZoom piece={zoomPiece} p={p} />}
      </ScrollScene>

      {/* CHAPTER 4 — 2.5D drift */}
      <ScrollScene heightVh={180}>
        {(p) => <DepthDrift piece={driftPiece} p={p} />}
      </ScrollScene>

      {/* CHAPTER 5 — the works, plainly (collectors need to SEE the catalog) */}
      <section className="mx-auto max-w-6xl px-6 py-28">
        <h2 className="text-3xl text-white/90 sm:text-4xl" style={{ fontFamily: 'var(--fl-display)' }}>Selected Works</h2>
        <div className="mt-12 grid gap-x-10 gap-y-16 sm:grid-cols-2">
          {pieces.map((piece, i) => (
            <figure key={i} className={i % 3 === 0 ? 'sm:translate-y-10' : ''}>
              <img src={piece.url} alt={piece.title} loading="lazy"
                className="w-full border-[10px] border-[#f4f1ea] shadow-xl transition-transform duration-500 hover:-translate-y-1.5" />
              <figcaption className="mt-4 text-sm text-white/70">
                <span className="font-semibold text-white/90">{piece.title}</span> — {piece.medium}, {piece.year}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* CHAPTER 6 — inquire */}
      <section className="border-t border-white/10 px-6 py-28 text-center">
        <h2 className="mx-auto max-w-3xl text-4xl leading-tight text-white/95 sm:text-5xl" style={{ fontFamily: 'var(--fl-display)' }}>
          Originals and commissions.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-white/65">Every piece here is available to view in person at the studio.</p>
        <a href={`mailto:${manifest.email}`}
          className="mt-9 inline-block rounded-full bg-[#f4f1ea] px-9 py-4 text-sm font-bold tracking-wide text-[#0c0b0e] transition-transform hover:-translate-y-0.5">
          Inquire — {manifest.email}
        </a>
        <p className="mt-16 text-xs uppercase tracking-[0.3em] text-white/35">{manifest.artist} · {manifest.discipline}</p>
      </section>
    </div>
  );
}
