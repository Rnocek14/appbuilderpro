// src/components/garvis/MarkWonInline.tsx
// The "they said yes" button. Lives on a positive pitch reply in the Queue: pick the tier, type
// the agreed price, one click — campaign → won, contact → customer, client-book row created, and
// the follow-through handed to you (payment link + Clients page). Price is what YOU agreed, typed
// by you — Garvis never invents a number.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Trophy } from 'lucide-react';
import { CLIENT_TIERS, type TierId } from '../../lib/garvis/billing/clientTiers';
import { closeCampaignWon, type WonClose } from '../../lib/garvis/closeWonRun';
import { Button, Input } from '../ui';

export function MarkWonInline({ campaignId, onClosed }: {
  campaignId: string;
  /** Called after a successful close so the lane can mark the reply handled + refresh. */
  onClosed: (won: WonClose) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<TierId>('website');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [won, setWon] = useState<WonClose | null>(null);

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const res = await closeCampaignWon({ campaignId, tier, priceUsd: Number(price) || 0 });
      setWon(res);
      onClosed(res);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not mark this won.'); }
    finally { setBusy(false); }
  };

  if (won) {
    return (
      <div className="mt-2 rounded-lg border border-forge-ok/40 bg-forge-ok/10 p-2 text-xs text-forge-ink">
        <p className="font-medium">🏆 {won.businessName} is in your client book.</p>
        <p className="mt-1 text-forge-dim">
          Next: {won.paymentLink
            ? <>send the payment link (<a className="text-forge-ember hover:underline" href={won.paymentLink} target="_blank" rel="noreferrer">open it</a>), </>
            : <>set your Stripe payment link on the <Link to="/garvis/client-billing" className="text-forge-ember hover:underline">Clients page</Link>, </>}
          {won.demoSlug && <>show them their site (<a className="text-forge-ember hover:underline" href={`/preview-site/${won.demoSlug}`} target="_blank" rel="noreferrer">the rebuild</a>), </>}
          {won.invoiceNumber && <>queue invoice {won.invoiceNumber} from <Link to="/garvis/money" className="text-forge-ember hover:underline">Money</Link>, </>}
          and send your agreement from Documents → e-sign when you're ready.
          {' '}<Link to="/garvis/client-billing" className="text-forge-ember hover:underline">Open Clients →</Link>
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-lg border border-forge-ok/50 bg-forge-ok/10 px-2.5 py-1 text-[11px] font-medium text-forge-ok hover:bg-forge-ok/20">
        <Trophy size={11} /> Mark won
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-forge-ok/40 bg-forge-panel/60 p-2">
      <p className="text-[11px] text-forge-dim">They said yes — record the deal. This marks the campaign won, moves them to customer, and adds them to your client book.</p>
      <div className="flex flex-wrap items-center gap-2">
        {CLIENT_TIERS.map((t) => (
          <label key={t.id} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${tier === t.id ? 'border-forge-ok/60 bg-forge-ok/10 text-forge-ink' : 'border-forge-border text-forge-dim'}`}>
            <input type="radio" className="hidden" checked={tier === t.id} onChange={() => setTier(t.id)} />
            {t.name} <span className="text-forge-dim">({t.priceHint})</span>
          </label>
        ))}
        <Input type="number" min={0} placeholder="Agreed price (USD)" value={price}
          onChange={(e) => setPrice(e.target.value)} className="w-40" />
        <Button size="sm" loading={busy} onClick={() => void confirm()}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Trophy size={12} />} Confirm won
        </Button>
        <button onClick={() => setOpen(false)} className="text-[11px] text-forge-dim hover:text-forge-ink">cancel</button>
      </div>
      {error && <p className="text-[11px] text-forge-err">{error}</p>}
    </div>
  );
}
