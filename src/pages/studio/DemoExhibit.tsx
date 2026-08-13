// src/pages/studio/DemoExhibit.tsx
// THE SHOWPIECE — the trust loop, performed. No agency site can copy this exhibit because it IS
// the product: the visitor watches, live in their browser,
//   ACT 1 (scan):  a dated "before" site (an honestly-labeled recreation of where most clients
//                  start) gets stamped with detection chips — each one a category the real
//                  scanner finds (SCAN_LOOKFORS, claims-gated);
//   ACT 2 (build): the real preview engine assembles the new site SECTION BY SECTION, with a
//                  build log whose lines are derived from the spec actually being rendered —
//                  the log cannot say something the build didn't do;
//   ACT 3 (done):  the finished demo, scrollable, with an honest caption and a Replay button.
// Every frame is true: the "before" is labeled a recreation, the business is labeled fictional,
// and the assembly is the genuine engine output (DEMO_PROFILES fixture → parseBusinessProfile →
// assembleFallbackSpec → PreviewSiteRenderer). prefers-reduced-motion skips straight to Act 3.
//
// Lazy-loaded and mounted on approach (StudioSite) so the landing's first paint stays instant.

import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { PreviewSiteRenderer } from '../../components/preview/PreviewSiteRenderer';
import { parseBusinessProfile, assembleFallbackSpec, type SiteSpec } from '../../lib/preview/spec';
import { DEMO_PROFILES } from '../../lib/preview/demoProfiles';
import { STUDIO, SCAN_LOOKFORS } from '../../content/studio';

const SCAN_MS = 620;          // per detection chip in Act 1
const BUILD_MS = 640;         // per section in Act 2

/** Human build-log line per section type — vocabulary of what assembleFallbackSpec actually
 *  placed. Derived from the spec being rendered, so the log can never claim an absent step. */
const LOG_LINES: Record<string, string> = {
  hero: 'Composing the hero from the business profile',
  trust: 'Laying the trust strip',
  services: 'Placing services',
  about: 'Writing the about block',
  showcase: 'Arranging the work showcase',
  gallery: 'Building the photo gallery',
  reviews: 'Setting real review copy',
  serviceArea: 'Mapping the service area',
  faq: 'Answering the common questions',
  hours: 'Posting hours',
  map: 'Dropping the map',
  quote: 'Wiring the quote form',
  ctaBanner: 'Raising the closing call-to-action',
  seoText: 'Tucking in the footer copy',
  scene: 'Staging the signature scene',
};

type Act = 'scan' | 'build' | 'done';

/** The honestly-labeled "before" — a recreation of the dated site most clients start with. */
function BeforeSite({ chips }: { chips: number }) {
  return (
    <div className="relative h-full overflow-hidden bg-[#d8d4c8] p-3" style={{ fontFamily: '"Times New Roman", serif' }}>
      <div className="bg-[#3a5a8c] py-4 text-center text-[22px] font-bold text-[#ffe66b]">~*~ JOE&apos;S ROOFING ~*~</div>
      <div className="bg-[#7a94b8] py-1.5 text-center text-[12px] text-white">| Home | About Us | Services | Contact Us | Links |</div>
      <div className="px-4 py-5 text-[14px] leading-relaxed text-[#222]">
        <p>Welcome to our Web Site!! We are a family owned and operated roofing company serving Lake Geneva and the surrounding areas.</p>
        <p className="mt-3 font-bold text-[#b00]">CALL US FOR A FREE ESTIMATE</p>
        <div className="mt-4 flex gap-3">
          <div className="flex h-24 w-36 items-center justify-center bg-[#aaa] text-[11px] text-[#666]" style={{ fontFamily: 'Arial, sans-serif' }}>[ photo1.jpg ]</div>
          <div className="flex h-24 w-36 items-center justify-center bg-[#aaa] text-[11px] text-[#666]" style={{ fontFamily: 'Arial, sans-serif' }}>[ photo2.jpg ]</div>
        </div>
        <p className="mt-5 font-bold underline">Our Services:</p>
        <ul className="mt-1 list-inside list-disc text-[13.5px]">
          <li>Roof Repair &amp; Replacement</li>
          <li>Storm Damage</li>
          <li>Gutters</li>
          <li>Free Estimates — call today!</li>
        </ul>
        <p className="mt-4 text-[13.5px]">
          Office: (262) 555-0143 &nbsp;·&nbsp; Hours: Mon-Fri
        </p>
        <p className="mt-5 border-t border-[#b6b1a4] pt-3 text-[12px] text-[#444]">
          Best viewed in Internet Explorer 6.0 at 800x600 — Last updated 04/2013
        </p>
        <p className="mt-1 text-[12px] text-[#444]">
          You are visitor number <span className="bg-black px-1.5 font-mono text-[#0f0]">004182</span>
        </p>
      </div>
      {/* detection chips stamp on one by one — each names a real scanner category */}
      <div className="pointer-events-none absolute inset-0 p-5">
        {SCAN_LOOKFORS.slice(0, chips).map((f, i) => (
          <span key={f}
            className="absolute inline-block rounded-full border px-3.5 py-1.5 text-[12px] font-semibold shadow-lg"
            style={{
              fontFamily: 'Inter, -apple-system, sans-serif',
              background: '#fff', borderColor: '#c14a17', color: '#a03c10',
              top: `${12 + (i % 4) * 21}%`, left: `${8 + ((i * 37) % 52)}%`,
              transform: `rotate(${(i % 2 ? -1 : 1) * (2 + (i % 3))}deg)`,
              animation: 'studio-stamp .3s cubic-bezier(.2,.9,.3,1.4) both',
            }}>
            ✕ {f}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DemoExhibit() {
  // Deterministic: same fixture, same recipe, same site — the exhibit is reproducible, not a slot
  // machine. parseBusinessProfile validates the fixture exactly as it validates a scraped one.
  const spec = useMemo(() => {
    const { profile } = parseBusinessProfile(DEMO_PROFILES[0]);
    return profile ? assembleFallbackSpec(profile) : null;
  }, []);

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  const [act, setAct] = useState<Act>(reduced ? 'done' : 'scan');
  const [chips, setChips] = useState(0);          // Act 1 progress
  const [built, setBuilt] = useState(reduced ? Infinity : 0);  // Act 2 progress (sections shown)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  // The page MOUNTS this component early (500px before the slot, so the heavy chunk is ready),
  // but the performance must not play to an empty room: hold at Act 1 frame zero until the
  // exhibit is genuinely on screen, then run. Without this the visitor can arrive to a finished
  // site and never see the build that is the entire argument.
  const [started, setStarted] = useState(reduced);
  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    if (typeof IntersectionObserver === 'undefined') { setStarted(true); return; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setStarted(true); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const totalChips = Math.min(4, SCAN_LOOKFORS.length);  // four stamps carry the point; seven would drone
  const sections = spec?.sections ?? [];

  useEffect(() => {
    if (!spec || reduced || !started || act === 'done') return;
    if (act === 'scan') {
      timer.current = setTimeout(() => {
        if (chips < totalChips) setChips(chips + 1);
        else { setAct('build'); setBuilt(1); }
      }, chips === 0 ? 900 : SCAN_MS);
    } else {
      timer.current = setTimeout(() => {
        if (built < sections.length) setBuilt(built + 1);
        else setAct('done');
      }, BUILD_MS);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [spec, reduced, started, act, chips, built, totalChips, sections.length]);

  // THE POINT OF THE WHOLE EXHIBIT: follow the build. Without this the visitor stares at the hero
  // while eleven sections assemble out of sight below the fold. The frame scrolls itself to the
  // newest section as each one lands, then rides back to the top when the site is finished — so
  // what you watch is a website being built, not a static hero with a log next to it. Scrolls the
  // INNER frame only (never the page), and is skipped entirely under reduced-motion.
  useEffect(() => {
    const el = frame.current;
    if (!el || reduced) return;
    if (act === 'build') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    if (act === 'done') el.scrollTo({ top: 0, behavior: 'smooth' });
  }, [act, built, reduced]);

  // The renderer stamps the DEMO's <title>/meta on every spec change; this page belongs to the
  // studio, so the exhibit re-asserts the studio's title after each build tick.
  useEffect(() => {
    document.title = `${STUDIO.name} — ${STUDIO.tagline}`;
  }, [act, built]);

  if (!spec) return null;

  const shownSpec: SiteSpec = act === 'done' || built >= sections.length
    ? spec
    : { ...spec, sections: sections.slice(0, built) };
  const logCount = Math.min(built, sections.length);

  const replay = () => { setChips(0); setBuilt(0); setAct('scan'); };

  return (
    <div ref={root} className="studio-exhibit overflow-hidden rounded-3xl border border-[#e6dbc9] bg-white shadow-[0_40px_110px_-32px_rgba(40,25,10,0.42)]">
      <style>{`@keyframes studio-stamp{from{opacity:0;transform:scale(1.6)}to{opacity:1}}
        @keyframes studio-logline{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        /* The generated site's own entrance animations are keyed to the VIEWPORT, but here it
           lives in a 560px scroll frame: a section appended below the frame's fold has not
           intersected yet, so it would land invisible — the exhibit would look like it was
           building blank panels. Neutralize exactly the three hidden-until-seen primitives
           (Reveal wrapper, TextReveal words, ImageReveal wipe) inside the frame and nothing
           else — no blanket transform reset that could disturb the real layout. The motion the
           visitor watches is the ASSEMBLY, which is the point. */
        .studio-exhibit .pv-rvl{opacity:1 !important;transform:none !important;transition:none !important}
        .studio-exhibit .pv-trw{transform:none !important;transition:none !important}
        .studio-exhibit .pv-irv{clip-path:none !important;transition:none !important}
        @keyframes studio-land{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .studio-exhibit .pv-site>*:last-child{animation:studio-land .42s cubic-bezier(.2,.7,.2,1) both}
        @media (prefers-reduced-motion: reduce){.studio-exhibit .pv-site>*:last-child{animation:none}}`}</style>
      {/* Browser chrome — frames the demo as a website, not a page section. */}
      <div className="flex items-center gap-2 border-b border-[#e6dbc9] bg-[#f3ecdf] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9cfc1]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9cfc1]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9cfc1]" />
        <span className="ml-3 truncate rounded-md bg-white px-3 py-1 font-mono text-[11px] text-[#7d7061]">
          {act === 'scan' ? 'joesroofing-old.example — reading their current site' : 'joesroofing.example — demonstration build'}
        </span>
        {act === 'done' && !reduced && (
          <button onClick={replay}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#e6dbc9] bg-white px-3 py-1 text-[11px] font-semibold text-[#7d7061] transition-colors hover:text-[#1d1712]">
            <RotateCcw size={11} /> Replay the build
          </button>
        )}
      </div>

      <div className="relative">
        <div ref={frame} className="h-[560px] overflow-y-auto overscroll-contain">
          {act === 'scan' ? <BeforeSite chips={chips} /> : <PreviewSiteRenderer spec={shownSpec} />}
        </div>

        {/* THE BUILD LOG — lines derived from the sections actually rendered so far. */}
        {act !== 'scan' && act !== 'done' && (
          <div className="pointer-events-none absolute bottom-4 left-4 w-[300px] max-w-[80%] rounded-2xl border border-[#e6dbc9] bg-white/95 p-4 shadow-xl backdrop-blur"
            style={{ fontFamily: 'Inter, -apple-system, sans-serif' }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c14a17]">Assembling — live</p>
            <div className="mt-2 space-y-1.5">
              {sections.slice(Math.max(0, logCount - 4), logCount).map((s, i, arr) => (
                <p key={`${s.type}-${logCount - arr.length + i}`} className="flex items-center gap-2 text-[12px] text-[#4c4238]" style={{ animation: 'studio-logline .25s ease both' }}>
                  <span className={i === arr.length - 1 ? 'inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#c14a17]' : 'inline-block h-1.5 w-1.5 rounded-full bg-[#2e7d4f]'} />
                  {LOG_LINES[s.type] ?? `Placing ${s.type}`}
                  {s.type === 'services' && Array.isArray(s.props.items) ? ` (${(s.props.items as unknown[]).length} found)` : ''}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="border-t border-[#e6dbc9] bg-[#f8f3ea] px-4 py-2.5 text-center text-[12px] text-[#7d7061]">
        {act === 'scan'
          ? 'A recreation of where most of our clients start. Each stamp is a problem our scanner really detects.'
          : '“Joe’s Roofing” is a fictional business. This site was assembled by our engine in your browser just now — scroll it, it’s real. Yours is built from your actual business.'}
      </p>
    </div>
  );
}
