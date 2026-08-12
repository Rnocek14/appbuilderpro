// src/pages/studio/DemoExhibit.tsx
// THE LIVE PROOF — the studio site's hero exhibit is not a screenshot: it is the real preview
// engine assembling a real demo site in the visitor's browser, right now, from a fixture
// business profile. That's the credibility argument in one artifact — "the engine that built
// this demo is the engine that will build yours" — and it can never drift from the product,
// because it IS the product. Honestly labeled: the business is fictional, the build is live.
//
// Lazy-loaded (the renderer pulls the full preview section library) and mounted only when the
// exhibit scrolls into view, so the landing's first paint stays instant.

import { useMemo } from 'react';
import { PreviewSiteRenderer } from '../../components/preview/PreviewSiteRenderer';
import { parseBusinessProfile, assembleFallbackSpec } from '../../lib/preview/spec';
import { DEMO_PROFILES } from '../../lib/preview/demoProfiles';

export default function DemoExhibit() {
  // Deterministic: same fixture, same recipe, same site — the exhibit is reproducible, not a slot
  // machine. parseBusinessProfile validates the fixture exactly as it validates a scraped one.
  const spec = useMemo(() => {
    const { profile } = parseBusinessProfile(DEMO_PROFILES[0]);
    return profile ? assembleFallbackSpec(profile) : null;
  }, []);

  if (!spec) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7ddd1] bg-white shadow-[0_24px_80px_-24px_rgba(40,25,10,0.35)]">
      {/* Browser chrome — frames the demo as a website, not a page section. */}
      <div className="flex items-center gap-2 border-b border-[#e7ddd1] bg-[#f2ede6] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9cfc1]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9cfc1]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9cfc1]" />
        <span className="ml-3 truncate rounded-md bg-white px-3 py-1 font-mono text-[11px] text-[#8a7d70]">
          joesroofing.example — demonstration build
        </span>
      </div>
      <div className="h-[560px] overflow-y-auto overscroll-contain">
        <PreviewSiteRenderer spec={spec} />
      </div>
      <p className="border-t border-[#e7ddd1] bg-[#faf7f3] px-4 py-2.5 text-center text-[12px] text-[#8a7d70]">
        “Joe’s Roofing” is a fictional business. This site was assembled by our engine in your
        browser just now — scroll it, it’s real. Yours is built from your actual business.
      </p>
    </div>
  );
}
