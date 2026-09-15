// src/components/garvis/QuickStartRealEstate.tsx
// THE REAL-ESTATE DOOR. One click, and it lands on the rail that actually works.
//
// It used to build 'mom-real-estate' — twenty chartered areas covering every option a realtor could
// ever want. That world is a MAP OF OPTIONS, not a working line: it has no listing_campaign area, no
// code anywhere can add one, and it opens on the marketing canvas with every studio hidden behind an
// "Advanced" disclosure. So the one real-estate button on the front page led away from the finished
// rail (facts with sources → draft → approval → scheduled → published → attributed inquiry) and into
// a room with no exit. The platform survey found this; it is fixed here by pointing the button at
// 'real-estate-campaign', which opens directly on the Campaign Studio.
//
// It is DETERMINISTIC: instantiateWeb seeds the areas with expert-playbook starters using zero AI —
// it works offline, with no key, every time.
//
// It also no longer hides itself the moment a business exists. Hiding it was why one wrong click made
// the correct workspace unreachable forever. Now it steps aside only when the real-estate workspace
// it creates is already there, and otherwise offers to open it.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2, ArrowRight } from 'lucide-react';
import { listWebs, instantiateWeb } from '../../lib/garvis/workwebRun';
import { GenerationReadiness } from './GenerationReadiness';
import { Button } from '../ui';

const TEMPLATE_ID = 'real-estate-campaign';

export function QuickStartRealEstate({ onToast }: { onToast: (k: 'success' | 'error' | 'info', m: string) => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'create' | 'open' | 'hide'>('loading');
  const [existingId, setExistingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listWebs()
      .then((webs) => {
        if (!live) return;
        // Already has it? Then this card becomes the way BACK to it — the thing that was missing.
        // Hiding this card the moment any business existed is how one wrong click used to make the
        // real-estate workspace unreachable forever.
        const mine = webs.find((w) => w.templateId === TEMPLATE_ID);
        if (mine) { setExistingId(mine.worldId); setState('open'); return; }
        setState('create');
      })
      .catch(() => { if (live) setState('hide'); }); // never block the page on this
    return () => { live = false; };
  }, []);

  const start = async () => {
    if (existingId) { navigate(`/garvis/webs/${existingId}`); return; }
    setBusy(true);
    try {
      const web = await instantiateWeb(TEMPLATE_ID);
      onToast('success', `Created \u201c${web.title}\u201d \u2014 it opens on the Campaign Studio.`);
      navigate(`/garvis/webs/${web.worldId}`);
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not set up the workspace.');
      setBusy(false);
    }
  };

  if (state === 'loading' || state === 'hide') return null;
  const opening = state === 'open';

  return (
    <div className="overflow-hidden rounded-2xl border border-forge-ember/30 bg-gradient-to-br from-forge-ember/12 via-forge-panel/40 to-forge-panel/20">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-forge-ember/30 bg-forge-ember/10">
          <Building2 size={20} className="text-forge-ember" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">Real estate</p>
          <h2 className="text-base font-semibold text-forge-ink">
            {opening ? 'Open the real-estate workspace' : 'Set up the real-estate workspace'}
          </h2>
          <p className="mt-1 text-sm text-forge-dim">
            {opening
              ? 'Your communities, their verified facts, and the next post — it opens straight on the Campaign Studio.'
              : 'Five areas, not twenty. It opens on the Campaign Studio: keep a community\u2019s facts with their sources, draft a post only from the ones still good, approve it, and see the inquiry it caused.'}
          </p>
          <Button variant='primary' size='md' onClick={() => void start()} disabled={busy} className="mt-3">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}
            {busy ? 'Setting it up…' : (opening ? 'Open it' : 'Set it up')} {!busy && <ArrowRight size={15} />}
          </Button>
          <GenerationReadiness compact />
        </div>
      </div>
    </div>
  );
}
