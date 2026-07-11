// src/components/garvis/MailerDesigner.tsx
// The direct-mail product surface: pick a concept + a REAL vault photo + the campaign's one offer,
// see a live 6×9 postcard (front and back) built from the world's own brand, generate a QR from the
// tracking link, then PRINT (print-ready @page CSS at true bleed) or save the design into the area
// and log a mail batch. No stock imagery, no invented facts — holes render as visible [EDIT] prompts.

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Printer, Save, Image as ImageIcon, Mail } from 'lucide-react';
import { compileMailer, type MailerConcept, type MailerSpec } from '../../lib/garvis/mailer';
import {
  loadMailerMaterials, saveMailerDesign, logMailBatch, listMailBatches,
  type MailerMaterials, type MailBatchRow,
} from '../../lib/garvis/mailerRun';
import { cn } from '../../lib/utils';

const CONCEPTS: { id: MailerConcept; label: string; blurb: string }[] = [
  { id: 'proof', label: 'Full-bleed proof', blurb: 'One stunning piece, minimal words. Lets the work sell.' },
  { id: 'before_after', label: 'Before / after', blurb: 'The transformation. Strongest when you have both shots.' },
  { id: 'local_authority', label: 'Local authority', blurb: 'The neighbor angle — the human, made here.' },
];

export function MailerDesigner({ worldId, clusterId, onToast }: {
  worldId: string; clusterId: string; onToast: (k: 'success' | 'error' | 'info', m: string) => void;
}) {
  const [materials, setMaterials] = useState<MailerMaterials | null>(null);
  const [concept, setConcept] = useState<MailerConcept>('proof');
  const [imageIx, setImageIx] = useState(0);
  const [offer, setOffer] = useState('');
  const [link, setLink] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<MailBatchRow[]>([]);
  const [pieceCount, setPieceCount] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void loadMailerMaterials(worldId).then((m) => { if (live) setMaterials(m); }).catch(() => {});
    void listMailBatches(worldId).then((b) => { if (live) setBatches(b); }).catch(() => {});
    return () => { live = false; };
  }, [worldId]);

  const hero = materials?.images[imageIx] ?? null;
  const spec: MailerSpec | null = useMemo(() => {
    if (!materials) return null;
    const ctx = materials.ctx ?? { business_name: '', principal: null, craft: null, offerings: [], audience: null, locale: null, links: {}, tone: null };
    return compileMailer({
      ctx, brand: materials.brand, concept,
      imageUrl: hero?.url ?? null, imageAlt: hero?.caption ?? null,
      offer, linkUrl: link || null,
    });
  }, [materials, concept, hero, offer, link]);

  // QR from the resolved tracking link — the exact URL the card prints.
  useEffect(() => {
    const url = spec?.back.linkUrl;
    if (!url) { setQr(null); return; }
    let live = true;
    void QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((d) => { if (live) setQr(d); }).catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [spec?.back.linkUrl]);

  const doPrint = () => window.print();

  const doSave = async () => {
    if (!spec) return;
    setBusy(true);
    try {
      await saveMailerDesign(clusterId, spec, `Postcard — ${CONCEPTS.find((c) => c.id === concept)?.label}`);
      onToast('success', 'Design saved into this area. Print it or log a mail batch below.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  const doLog = async (status: MailBatchRow['status']) => {
    if (!spec) return;
    const n = parseInt(pieceCount, 10);
    if (!Number.isFinite(n) || n <= 0) { onToast('error', 'Enter how many pieces this batch is.'); return; }
    setBusy(true);
    try {
      await saveMailerDesign(clusterId, spec, `Postcard — ${CONCEPTS.find((c) => c.id === concept)?.label}`);
      const row = await logMailBatch({
        worldId, clusterId, artifactSlug: `postcard-${concept.replace('_', '-')}`,
        title: `${CONCEPTS.find((c) => c.id === concept)?.label} postcard`, pieceCount: n, status,
      });
      setBatches((b) => [row, ...b]);
      setPieceCount('');
      onToast('success', status === 'mailed' ? `Logged ${n} pieces as mailed — the ledger counts it now.` : `Logged ${n} pieces as ${status}.`);
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not log the batch.'); }
    finally { setBusy(false); }
  };

  if (!materials) return <div className="mt-4 flex items-center gap-2 text-sm text-forge-dim"><Loader2 size={14} className="animate-spin" /> Loading your brand and photos…</div>;

  const noPhotos = materials.images.length === 0;
  const accent = spec?.accent ?? '#FF8A3D';

  return (
    <div className="mt-4">
      {/* Print stylesheet: only the postcard prints, at true 6.25×9.25 bleed, one card per page. */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .mailer-print, .mailer-print * { visibility: visible !important; }
          .mailer-print { position: absolute; left: 0; top: 0; }
          .mailer-card { page-break-after: always; box-shadow: none !important; }
          @page { size: 9.25in 6.25in; margin: 0; }
        }
      `}</style>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Controls */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-forge-dim">Concept</label>
            <div className="mt-1 space-y-1.5">
              {CONCEPTS.map((c) => (
                <button key={c.id} onClick={() => setConcept(c.id)}
                  className={cn('block w-full rounded-lg border px-3 py-2 text-left transition-colors', concept === c.id ? 'border-forge-ember/60 bg-forge-ember/5' : 'border-forge-border hover:border-forge-ember/40')}>
                  <div className="text-sm text-forge-ink">{c.label}</div>
                  <div className="text-[11px] text-forge-dim">{c.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-forge-dim">Front photo (your vault)</label>
            {noPhotos ? (
              <p className="mt-1 flex items-start gap-1.5 text-[11px] text-forge-warn"><ImageIcon size={13} className="mt-px shrink-0" /> No photos in this world yet. Upload real artwork in the Brain — the card uses your work, never stock.</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {materials.images.slice(0, 12).map((img, i) => (
                  <button key={img.url} onClick={() => setImageIx(i)}
                    className={cn('h-12 w-12 overflow-hidden rounded border-2 transition-colors', i === imageIx ? 'border-forge-ember' : 'border-transparent hover:border-forge-border')}>
                    <img src={img.url} alt={img.caption ?? ''} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-forge-dim">The one offer (40/40/20: the offer is 40%)</label>
            <textarea value={offer} onChange={(e) => setOffer(e.target.value)} rows={2}
              placeholder="e.g. First consult free — 3 concepts for your space."
              className="mt-1 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-forge-dim">Tracking link (becomes the QR)</label>
            <input value={link} onChange={(e) => setLink(e.target.value)}
              placeholder={materials.ctx?.links && Object.values(materials.ctx.links)[0] ? String(Object.values(materials.ctx.links)[0]) : 'https://…'}
              className="mt-1 w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-xs text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none" />
          </div>

          <div className="flex gap-2">
            <button onClick={doPrint} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-2 text-sm font-medium text-[#1A0E04] disabled:opacity-60">
              <Printer size={14} /> Print / PDF
            </button>
            <button onClick={() => void doSave()} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-sm text-forge-ink hover:border-forge-ember/50 disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
        </div>

        {/* Live preview — front + back at 6:9 aspect */}
        <div className="mailer-print space-y-4">
          {spec && (
            <>
              <PostcardFront spec={spec} accent={accent} />
              <PostcardBack spec={spec} accent={accent} qr={qr} />
            </>
          )}
        </div>
      </div>

      {/* Mail log — the honest record of what actually went out */}
      <div className="mt-5 rounded-xl border border-forge-border bg-forge-raised/30 p-3">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-forge-ink"><Mail size={14} className="text-forge-ember" /> Mail log</h4>
        <p className="mt-0.5 text-[11px] text-forge-dim">Garvis doesn't mail for you — you print or send to a vendor, then log what went out. Mailed batches count as real outreach in the ledger.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={pieceCount} onChange={(e) => setPieceCount(e.target.value)} inputMode="numeric" placeholder="# pieces"
            className="w-24 rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          <button onClick={() => void doLog('printed')} disabled={busy} className="rounded-lg border border-forge-border px-2.5 py-1 text-[11px] text-forge-dim hover:text-forge-ink disabled:opacity-60">Log printed</button>
          <button onClick={() => void doLog('mailed')} disabled={busy} className="rounded-lg border border-forge-ember/50 px-2.5 py-1 text-[11px] text-forge-ember hover:bg-forge-ember/10 disabled:opacity-60">Log mailed</button>
        </div>
        {batches.length > 0 && (
          <ul className="mt-2 space-y-1">
            {batches.slice(0, 6).map((b) => (
              <li key={b.id} className="flex items-center justify-between text-[11px] text-forge-dim">
                <span className="truncate text-forge-ink/80">{b.title} · {b.piece_count} pieces</span>
                <span className={cn('rounded border px-1.5 py-0.5 uppercase tracking-wide', b.status === 'mailed' ? 'border-forge-ok/40 text-forge-ok' : 'border-forge-border')}>{b.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** 6×9 front. Aspect 9:6 landscape; the photo bleeds full, headline over a legibility scrim. */
function PostcardFront({ spec, accent }: { spec: MailerSpec; accent: string }) {
  return (
    <div className="mailer-card relative w-full overflow-hidden rounded-lg bg-black shadow-soft" style={{ aspectRatio: '9 / 6' }}>
      {spec.front.imageUrl
        ? <img src={spec.front.imageUrl} alt={spec.front.imageAlt} className="absolute inset-0 h-full w-full object-cover" />
        : <div className="absolute inset-0 flex items-center justify-center bg-forge-raised text-xs text-forge-dim">Pick a vault photo →</div>}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-[5%] pt-[15%]">
        {spec.front.kicker && <div className="text-[2.6vw] uppercase tracking-widest text-white/80 lg:text-[13px]" style={{ color: accent }}>{spec.front.kicker}</div>}
        <div className="text-[4.4vw] font-bold leading-tight text-white lg:text-[26px]">{spec.front.headline}</div>
      </div>
    </div>
  );
}

/** 6×9 back. Copy left, QR + address zone right — bottom-right kept clear for postage per USPS. */
function PostcardBack({ spec, accent, qr }: { spec: MailerSpec; accent: string; qr: string | null }) {
  return (
    <div className="mailer-card relative w-full overflow-hidden rounded-lg border border-forge-border bg-white text-neutral-900 shadow-soft" style={{ aspectRatio: '9 / 6' }}>
      <div className="flex h-full">
        <div className="flex w-1/2 flex-col p-[4%]">
          <div className="text-[3.4vw] font-bold leading-tight lg:text-[19px]" style={{ color: accent }}>{spec.back.headline}</div>
          <div className="mt-[3%] whitespace-pre-line text-[2vw] leading-snug text-neutral-700 lg:text-[12px]">{spec.back.body}</div>
          <div className="mt-auto">
            <div className="text-[2.2vw] font-semibold lg:text-[13px]">{spec.back.cta}</div>
            <div className="mt-[2%] text-[1.7vw] text-neutral-500 lg:text-[10px]">{spec.back.contactLine}</div>
            {spec.back.complianceLine && <div className="mt-[1%] text-[1.4vw] text-neutral-400 lg:text-[9px]">{spec.back.complianceLine}</div>}
          </div>
        </div>
        <div className="flex w-1/2 flex-col items-end justify-between p-[4%]">
          {qr ? <img src={qr} alt="QR to the tracking link" className="h-[26%] w-auto" /> : <div className="h-[26%] w-[26%] rounded bg-neutral-100" />}
          {/* Address + postage zone — intentionally blank (the vendor/mail-merge fills it). */}
          <div className="w-full rounded border border-dashed border-neutral-300 p-[4%] text-right text-[1.5vw] text-neutral-300 lg:text-[9px]" style={{ minHeight: '38%' }}>
            address block · postage
          </div>
        </div>
      </div>
    </div>
  );
}
