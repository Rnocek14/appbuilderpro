// src/components/garvis/FirstRunGuide.tsx
// "The entire system is super confusing." This is the orientation a brand-new world was missing:
// three concrete steps from an empty territory to real, generated marketing. It appears at the top
// of a world that has produced NO earned work yet (seed playbooks don't count), and vanishes the
// moment the first real artifact exists. Dismissible per-world (localStorage) so it never nags.
//
// The steps are honest and in dependency order:
//   1. Connect an AI key — only shown when we can SEE it's missing (DIRECT mode, no key). This is the
//      real reason a studio feels empty; without it, generation is templates-only.
//   2. Set the brand — the studios write in this voice; skipping it just means a plainer first draft.
//   3. Open a studio and press Generate — the hero button in every studio.
// No step claims anything that hasn't happened; step 1 hides itself when readiness can't be verified.

import { useEffect, useState, type ReactNode } from 'react';
import { Compass, KeyRound, Palette, Sparkles, X, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resolveAI, subscribeAIConfig } from '../../lib/aiConfig';
import { getBrandKit } from '../../lib/garvis/artifacts';

const DISMISS_PREFIX = 'garvis.firstrun.dismissed.';

export function FirstRunGuide({ worldId, hasEarnedWork }: {
  worldId: string; hasEarnedWork: boolean;
}) {
  const [dismissed, setDismissed] = useState(true); // default hidden until we read storage
  const [ai, setAi] = useState(() => resolveAI());
  const [brandSet, setBrandSet] = useState(false);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_PREFIX + worldId) === '1'); }
    catch { setDismissed(false); }
  }, [worldId]);
  useEffect(() => subscribeAIConfig(() => setAi(resolveAI())), []);
  useEffect(() => {
    let live = true;
    getBrandKit(worldId).then((k) => { if (live) setBrandSet(!!k?.name); }).catch(() => {});
    return () => { live = false; };
  }, [worldId]);

  // Once there's real work, the guide's job is done — never show it again for this world.
  if (hasEarnedWork || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_PREFIX + worldId, '1'); } catch { /* private mode */ }
    setDismissed(true);
  };

  // Step 1 only appears when we can actually verify the key is missing (DIRECT mode). In edge mode
  // the key is a server secret we can't see — so we don't assert it's missing.
  const keyMissing = ai.direct && !ai.ready;

  const steps: { done: boolean; icon: typeof KeyRound; title: string; body: ReactNode }[] = [];
  if (keyMissing) {
    steps.push({
      done: false, icon: KeyRound,
      title: 'Connect an AI key',
      body: <>This is what makes studios generate <span className="text-forge-ink">real, personalized</span> work instead of generic templates. <Link to="/settings" className="text-forge-ember underline">Open Settings</Link> — paste-once, stored in this browser.</>,
    });
  }
  steps.push({
    done: brandSet, icon: Palette,
    title: brandSet ? 'Brand set' : 'Set the brand (optional)',
    body: brandSet
      ? <>The studios write in this voice.</>
      : <>Open the <span className="text-forge-ink">Vault</span> area on the left and add a name, tone, and colors. Skipping it just means a plainer first draft.</>,
  });
  steps.push({
    done: false, icon: Sparkles,
    title: 'Open a studio and press Generate',
    body: <>Pick any studio on the left (Seller Campaigns, Social Content, Direct Mail…) and hit the big <span className="text-forge-ink">Generate</span> button at the top. Its work lands on the shelf — nothing sends without your approval.</>,
  });

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-forge-ember/30 bg-gradient-to-br from-forge-ember/10 to-forge-panel/30">
      <div className="flex items-center gap-2 border-b border-forge-border/60 px-4 py-2.5">
        <Compass size={16} className="text-forge-ember" />
        <h3 className="text-sm font-semibold text-forge-ink">Get your first real marketing — {steps.length} steps</h3>
        <button onClick={dismiss} title="Dismiss" className="ml-auto text-forge-dim/60 transition-colors hover:text-forge-ink"><X size={15} /></button>
      </div>
      <ol className="divide-y divide-forge-border/40">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className="flex items-start gap-3 px-4 py-3">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${s.done ? 'border-forge-ok/50 bg-forge-ok/10 text-forge-ok' : 'border-forge-ember/40 bg-forge-ember/10 text-forge-ember'}`}>
                {s.done ? <Check size={14} /> : i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-forge-ink">
                  <Icon size={13} className="text-forge-dim" /> {s.title}
                </p>
                <p className="mt-0.5 text-xs text-forge-dim">{s.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
