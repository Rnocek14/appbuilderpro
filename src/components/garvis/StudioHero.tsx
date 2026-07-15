// src/components/garvis/StudioHero.tsx
// THE ANSWER TO "I don't even know how to generate it."
//
// Every studio now opens with a hero: a premium, flavor-styled header that (1) names what THIS
// studio makes in plain words, and (2) surfaces ONE unmistakable Generate button that runs the
// studio's real primary producer. Before this, the only generate affordance was a small button
// buried in a row of tools at the bottom — easy to miss, jargon-named. The finished-work producers
// were already there; they just weren't discoverable.
//
// Honesty holds: the button runs the SAME grounded producer as before (real research/brand/photos
// when an AI key is connected; the expert-playbook floor otherwise), and the GenerationReadiness
// line tells the truth about which of those you're getting. Nothing here fabricates output or
// claims work that didn't happen — an empty result still surfaces its own honest message via toast.
//
// Flavors with a dedicated working surface (the answering desk, document/data/tracker studios, the
// farm, market data, the website builder) show the header + that surface instead of a generic
// Generate button — for those the panel IS the action, so a second button would only confuse.

import { useState } from 'react';
import {
  Sparkles, Loader2, Mail, Share2, Clapperboard, Megaphone, Globe, PenLine,
  FlaskConical, LayoutGrid,
} from 'lucide-react';
import type { Flavor } from '../../lib/garvis/workweb';
import { runTool, type WebCluster } from '../../lib/garvis/workwebRun';
import { GenerationReadiness } from './GenerationReadiness';
import { Button } from '../ui';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

interface HeroConfig {
  icon: typeof Sparkles;
  makes: string;          // "what this studio makes", plain words
  /** The primary producer tool. null → a dedicated panel below is the working surface. */
  primaryTool: string | null;
  cta: string;            // the button label, e.g. "Generate social posts"
}

// One entry per studio flavor. Tool ids match the generators in workwebRun.runTool / workweb tools.
const HERO: Partial<Record<Flavor, HeroConfig>> = {
  generic:     { icon: PenLine,      makes: 'campaign copy, angles, and messaging for this part of the business.', primaryTool: 'gen-copy',          cta: 'Generate copy' },
  direct_mail: { icon: Mail,         makes: 'a real designed postcard — your photo on a print-ready card you can Print or save as PDF. Use the designer below.', primaryTool: null, cta: '' },
  // social + video have a full working studio below (publisher / storyboard). The panel IS the action,
  // so the hero only frames it — a second "Generate" button on top just re-teaches "make something".
  social:      { icon: Share2,       makes: 'platform-ready posts for Facebook & Instagram — write, preview, and post them from the publisher below.', primaryTool: null, cta: '' },
  video:       { icon: Clapperboard, makes: 'a 30-second reel — a captioned storyboard you can play, built from your own photos. Use the video studio below.', primaryTool: null, cta: '' },
  ads:         { icon: Megaphone,    makes: 'launch-ready ad copy, keywords, and tracking URLs for Meta and Google.', primaryTool: 'gen-ads',           cta: 'Generate an ad campaign' },
  email:       { icon: Mail,         makes: 'ready-to-send emails from a gallery of ideas — pick one, spin the angle, edit, and save. Use the email studio below.', primaryTool: null, cta: '' },
  feature_lab: { icon: FlaskConical, makes: 'distinct, buildable product concepts — then a full spec for the one you pick.', primaryTool: 'gen-features',      cta: 'Generate feature concepts' },
  content_growth: { icon: Clapperboard, makes: 'a multi-scene vertical reel storyboard for a faceless AI-video account — shot prompts, captions, and a voiceover script. The honest seed the clip engine fills.', primaryTool: 'gen-reel', cta: 'Generate a reel storyboard' },
  // Dedicated-surface flavors: the panel below is the action; the hero just frames it.
  landing:     { icon: Globe,        makes: 'a campaign landing page built from this world’s brand and artwork.',  primaryTool: null, cta: '' },
  market:      { icon: LayoutGrid,   makes: 'honest market stats computed from your own MLS/RESO feed.',           primaryTool: null, cta: '' },
  lists:       { icon: LayoutGrid,   makes: 'neighborhood farm lists, viability math, and an addressed print run.', primaryTool: null, cta: '' },
  assist:      { icon: PenLine,      makes: 'replies to incoming messages, grounded only in your saved answers.',  primaryTool: null, cta: '' },
  deliver:     { icon: PenLine,      makes: 'finished, exportable documents — proposals, reports, one-pagers.',    primaryTool: null, cta: '' },
  data:        { icon: LayoutGrid,   makes: 'typed tables, honest per-column stats, and charts from your CSVs.',   primaryTool: null, cta: '' },
  tracker:     { icon: LayoutGrid,   makes: 'a queryable log — client notes, expenses, decisions become memory.',  primaryTool: null, cta: '' },
};

/**
 * The studio header. Renders for studio-archetype clusters. `hasEarnedWork` (this studio has real,
 * non-seed artifacts) collapses the big empty-state pitch into a slim "generate more" header so it
 * stops shouting once there's work on the shelf.
 */
export function StudioHero({ cluster, worldId, hasEarnedWork, onDone, onToast }: {
  cluster: WebCluster; worldId: string; hasEarnedWork: boolean; onDone: () => void; onToast: Toast;
}) {
  const [busy, setBusy] = useState(false);
  const flavor = (cluster.charter?.flavor ?? 'generic') as Flavor;
  const cfg = HERO[flavor] ?? HERO.generic!;
  const Icon = cfg.icon;

  const generate = async () => {
    if (!cfg.primaryTool) return;
    setBusy(true);
    try {
      const res = await runTool(worldId, cluster, cfg.primaryTool);
      onToast(res.ok ? 'success' : 'error', res.message || (res.ok ? 'Generated.' : 'Nothing generated.'));
      if (res.ok) onDone();
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-forge-ember/25 bg-gradient-to-br from-forge-ember/10 via-forge-panel/40 to-forge-panel/20">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-forge-ember/30 bg-forge-ember/10">
          <Icon size={20} className="text-forge-ember" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">
            {hasEarnedWork ? 'Studio' : 'Studio · ready to work'}
          </p>
          <p className="mt-0.5 text-sm font-medium text-forge-ink">Makes {cfg.makes}</p>

          {cfg.primaryTool && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant='primary' size='md'
                onClick={() => void generate()} disabled={busy}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {hasEarnedWork ? 'Generate another' : cfg.cta}
              </Button>
              <span className="text-[11px] text-forge-dim">
                Grounded in this world’s brand & files. Anything that sends or posts goes through Approvals first — never straight out.
              </span>
            </div>
          )}
          {!cfg.primaryTool && !hasEarnedWork && (
            <p className="mt-2 text-[11px] text-forge-dim">Use the workspace below to get started — it’s the working surface for this studio.</p>
          )}

          {/* The honest line: real personalized work vs the template floor. Only speaks when it can. */}
          <GenerationReadiness compact />
        </div>
      </div>
    </div>
  );
}
