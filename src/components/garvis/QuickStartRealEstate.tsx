// src/components/garvis/QuickStartRealEstate.tsx
// THE FRONT DOOR that was missing. A brand-new operator lands on Command and sees generic chips,
// none of which mention real estate — while the fully-built "Mom Real Estate Marketing" venture is
// one deterministic function call away (instantiateWeb('mom-real-estate')) but buried at the bottom
// of the Ventures page. This card puts that one click where the user actually starts.
//
// It is DETERMINISTIC: instantiateWeb seeds the whole territory (seller & buyer campaigns, direct
// mail, social, video, landing pages, CRM) with expert-playbook starters using zero AI — so it works
// offline, with no key, every time. Then it drops the user straight inside the created world, which
// opens on its first studio. From there the studio hero's Generate button (and, with an AI key, real
// personalized work) takes over.
//
// Honest by construction: it only renders when the operator has NO venture yet (nothing to be
// confused by an extra CTA), and it says plainly that it creates STARTER playbooks — real,
// personalized generation still wants an AI key, which the readiness line states truthfully.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2, ArrowRight } from 'lucide-react';
import { listWebs, instantiateWeb } from '../../lib/garvis/workwebRun';
import { GenerationReadiness } from './GenerationReadiness';
import { Button } from '../ui';

export function QuickStartRealEstate({ onToast }: { onToast: (k: 'success' | 'error' | 'info', m: string) => void }) {
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'show' | 'hide'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listWebs()
      .then((w) => { if (live) setState(w.length === 0 ? 'show' : 'hide'); })
      .catch(() => { if (live) setState('hide'); }); // never block the page on this
    return () => { live = false; };
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      const web = await instantiateWeb('mom-real-estate');
      onToast('success', `Created “${web.title}” — every studio is set up. Open one and press Generate.`);
      navigate(`/garvis/webs/${web.worldId}`); // the world opens on its first studio
    } catch (e) {
      onToast('error', e instanceof Error ? e.message : 'Could not set up the business.');
      setBusy(false);
    }
  };

  if (state !== 'show') return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-forge-ember/30 bg-gradient-to-br from-forge-ember/12 via-forge-panel/40 to-forge-panel/20">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-forge-ember/30 bg-forge-ember/10">
          <Building2 size={20} className="text-forge-ember" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">Start here</p>
          <h2 className="text-base font-semibold text-forge-ink">Set up Mom’s Real Estate marketing</h2>
          <p className="mt-1 text-sm text-forge-dim">
            One click builds the whole marketing operation — seller & buyer campaigns, direct mail, social,
            video, landing pages, and a contacts book — each studio pre-loaded with a starter playbook.
            No setup, works right now.
          </p>
          <Button variant='primary' size='md' onClick={() => void start()} disabled={busy} className="mt-3">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}
            {busy ? 'Setting it up…' : 'Set it up'} {!busy && <ArrowRight size={15} />}
          </Button>
          <GenerationReadiness compact />
        </div>
      </div>
    </div>
  );
}
