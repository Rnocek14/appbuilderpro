// src/components/garvis/CampaignComposer.tsx
// THE SIMPLE FLOW: one short form → your whole marketing set → finished pieces you can look at.
// No areas to navigate, no wall of Generate buttons. Pick what you're announcing (Just Listed /
// Sold / Open House / Find sellers), fill a few fields, drop a photo, press one button — and get a
// designed postcard (front + back), ready social posts, and an email, all from the SAME real facts.
//
// Everything here is honest: composeCampaign is deterministic (works with no AI key), every number
// is the string you typed, missing facts show as [EDIT] holes with a warning, and nothing goes out
// on its own — "Post" queues an approval, the postcard you Print/mail yourself.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Printer, Save, Upload, Sparkles, Copy, Send, ArrowLeft, Home, CheckCircle2 } from 'lucide-react';
import { composeCampaign, CAMPAIGN_TYPES, type CampaignType, type CampaignSet } from '../../lib/garvis/campaignCore';
import { getBrandKit, uploadClusterFile } from '../../lib/garvis/artifacts';
import { loadWeb } from '../../lib/garvis/workwebRun';
import { saveMailerDesign } from '../../lib/garvis/mailerRun';
import { queueSocialPost } from '../../lib/garvis/socialRun';
import { PostcardViewer, PostcardFront, PostcardBack } from './Postcard';
import { StudioPreviewFrame } from './StudioPreviewFrame';
import type { MailerBrand } from '../../lib/garvis/mailer';
import { cn } from '../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function CampaignComposer({ worldId, onToast }: { worldId: string; onToast: Toast }) {
  // Where to save the postcard design + the uploaded photo (any studio cluster in this world works,
  // since the mailer reads photos world-wide). Prefer the direct-mail area.
  const [targetCluster, setTargetCluster] = useState<string | null>(null);
  const [brand, setBrand] = useState<MailerBrand | null>(null);
  const [accent, setAccent] = useState('#FF8A3D');
  const [defaultAgent, setDefaultAgent] = useState('');

  const [type, setType] = useState<CampaignType | null>(null);
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [area, setArea] = useState('');
  const [highlight, setHighlight] = useState('');
  const [openWhen, setOpenWhen] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [link, setLink] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const [set, setSet] = useState<CampaignSet | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<Record<number, boolean>>({});

  useEffect(() => {
    let live = true;
    void loadWeb(worldId).then((w) => {
      if (!live || !w) return;
      const dm = w.clusters.find((c) => c.charter?.flavor === 'direct_mail')
        ?? w.clusters.find((c) => c.charter?.archetype === 'studio')
        ?? w.clusters.find((c) => c.charter);
      setTargetCluster(dm?.id ?? null);
    }).catch(() => {});
    void getBrandKit(worldId).then((k) => {
      if (!live || !k) return;
      setBrand({ palette: k.palette, fonts: k.fonts, compliance_line: k.compliance_line });
      if (k.palette?.[0]) setAccent(k.palette[0]);
      const nm = (k.name ?? '').trim();
      if (nm) { setDefaultAgent(nm); setAgentName((a) => a || nm); }
    }).catch(() => {});
    return () => { live = false; };
  }, [worldId]);

  const cfg = CAMPAIGN_TYPES.find((t) => t.id === type) ?? null;

  const addPhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) { onToast('error', 'Pick an image (JPG or PNG).'); return; }
    if (!targetCluster) { onToast('error', 'This business has no studio to store the photo yet.'); return; }
    setUploading(true);
    try {
      const row = await uploadClusterFile(targetCluster, file);
      setPhotoUrl(row.url);
      onToast('success', 'Photo added.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not add the photo.'); }
    finally { setUploading(false); }
  };

  const make = () => {
    if (!type) return;
    setBusy(true);
    const s = composeCampaign({
      type, brand, businessName: defaultAgent || null,
      agentName: agentName || null, agentPhone: agentPhone || null,
      address: address || null, price: price || null, beds: beds || null, baths: baths || null,
      area: area || null, highlight: highlight || null, openWhen: openWhen || null,
      photoUrl, photoAlt: address || area || null, link: link || null,
    });
    setSet(s);
    setPosted({});
    setBusy(false);
    if (s.warnings.length) onToast('info', `Made your marketing — ${s.warnings.length} thing${s.warnings.length === 1 ? '' : 's'} to fill in (marked in yellow).`);
    else onToast('success', 'Your marketing is ready.');
  };

  // QR for the postcard back from the tracking link.
  useEffect(() => {
    const url = set?.postcard.back.qrUrl ?? set?.postcard.back.linkUrl;
    if (!url) { setQr(null); return; }
    let live = true;
    void QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((d) => { if (live) setQr(d); }).catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [set?.postcard.back.linkUrl, set?.postcard.back.qrUrl]);

  const savePostcard = useCallback(async () => {
    if (!set || !targetCluster) return;
    setBusy(true);
    try {
      await saveMailerDesign(targetCluster, set.postcard, `${CAMPAIGN_TYPES.find((t) => t.id === set.type)?.label} postcard`);
      onToast('success', 'Postcard saved. Print it, or send to a mail vendor.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  }, [set, targetCluster, onToast]);

  const postSocial = async (ix: number, caption: string) => {
    try {
      // Instagram requires an image; only include it (and IG) when we actually have the photo — a
      // caption-only post goes to Facebook, which allows text-only. (Same refusal the edge re-checks.)
      const media = photoUrl ? [photoUrl] : [];
      const platforms = photoUrl ? ['facebook', 'instagram'] : ['facebook'];
      await queueSocialPost({ text: caption, platforms, mediaUrls: media, worldId });
      setPosted((p) => ({ ...p, [ix]: true }));
      onToast('success', 'Queued for your approval — approve it in the Queue and it posts to her accounts.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not queue the post.'); }
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); onToast('success', `${what} copied.`); }
    catch { onToast('info', 'Select the text and copy it manually.'); }
  };

  // ---------- RESULTS ----------
  if (set) {
    return (
      <div>
        <style>{`
          .mailer-print-both { display: none; }
          @media print {
            body * { visibility: hidden !important; }
            .mailer-print, .mailer-print * { visibility: visible !important; }
            .mailer-print-both { display: block !important; }
            .mailer-print { position: absolute; left: 0; top: 0; width: 100%; }
            .mailer-card { page-break-after: always; box-shadow: none !important; }
            @page { size: 9.25in 6.25in; margin: 0; }
          }
        `}</style>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button onClick={() => setSet(null)} className="flex items-center gap-1 text-sm text-forge-dim hover:text-forge-ink"><ArrowLeft size={15} /> Edit the details</button>
          <span className="ml-auto text-xs text-forge-dim">Nothing sends on its own — you approve every post and print the card yourself.</span>
        </div>

        {set.warnings.length > 0 && (
          <div className="mb-4 rounded-xl border border-forge-warn/40 bg-forge-warn/5 p-3 text-xs text-forge-dim">
            <p className="mb-1 font-medium text-forge-warn">A few things to fill in (they show as [EDIT] on the pieces):</p>
            <ul className="list-inside list-disc space-y-0.5">{set.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
        )}

        {/* The postcard */}
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-forge-ink">🖼 Your postcard</h3>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              {/* On screen: flip between front and back to look. */}
              <PostcardViewer spec={set.postcard} accent={accent} qr={qr} />
              {/* Print/PDF: BOTH sides, hidden on screen, revealed only when printing (front → page 1,
                  back → page 2). Separate from the flip viewer so the toggle chrome never prints. */}
              <div className="mailer-print mailer-print-both">
                <PostcardFront spec={set.postcard} accent={accent} />
                <PostcardBack spec={set.postcard} accent={accent} qr={qr} />
              </div>
            </div>
            <div className="flex flex-row gap-2 lg:flex-col">
              <button onClick={() => window.print()} className="flex items-center justify-center gap-1.5 rounded-lg bg-ember-gradient px-3 py-2 text-sm font-medium text-[#1A0E04]"><Printer size={14} /> Print / Save PDF</button>
              <button onClick={() => void savePostcard()} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-lg border border-forge-border px-3 py-2 text-sm text-forge-ink hover:border-forge-ember/50 disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button>
            </div>
          </div>
        </section>

        {/* Social posts */}
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-forge-ink">📱 Social posts</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {set.socialPosts.map((p, i) => (
              <div key={i} className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
                <StudioPreviewFrame medium="social" content={p.caption} accent={accent} />
                <div className="mt-2 flex gap-2">
                  <button onClick={() => void postSocial(i, p.caption)} disabled={posted[i]}
                    className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium', posted[i] ? 'border border-forge-ok/40 text-forge-ok' : 'bg-ember-gradient text-[#1A0E04]')}>
                    {posted[i] ? <><CheckCircle2 size={13} /> Queued</> : <><Send size={13} /> Post</>}
                  </button>
                  <button onClick={() => void copy(p.caption, 'Post')} className="rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-dim hover:text-forge-ink"><Copy size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Email */}
        <section className="mb-2">
          <h3 className="mb-2 text-sm font-semibold text-forge-ink">✉️ Email</h3>
          <div className="rounded-xl border border-forge-border bg-forge-panel/40 p-3">
            <p className="mb-2 text-xs"><span className="text-forge-dim">Subject:</span> <span className="font-medium text-forge-ink">{set.email.subject}</span></p>
            <StudioPreviewFrame medium="email" content={set.email.body} accent={accent} />
            <div className="mt-2 flex gap-2">
              <button onClick={() => void copy(`Subject: ${set.email.subject}\n\n${set.email.body}`, 'Email')} className="flex items-center gap-1.5 rounded-lg border border-forge-border px-2.5 py-1.5 text-xs text-forge-dim hover:text-forge-ink"><Copy size={13} /> Copy email</button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ---------- FORM ----------
  const field = 'w-full rounded-lg border border-forge-border bg-forge-bg px-2.5 py-1.5 text-sm text-forge-ink placeholder:text-forge-dim/60 focus:border-forge-ember/60 focus:outline-none';
  const canMake = !!type && (type === 'find_sellers' ? !!area.trim() : !!address.trim());

  return (
    <div className="rounded-2xl border border-forge-ember/25 bg-gradient-to-br from-forge-ember/8 to-forge-panel/30 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Home size={18} className="text-forge-ember" />
        <h2 className="text-base font-semibold text-forge-ink">Make my marketing</h2>
      </div>
      <p className="mb-3 text-sm text-forge-dim">Tell me what you're announcing and I'll make the whole set — a postcard, social posts, and an email — from the same details.</p>

      {/* 1) What are we announcing? */}
      <div className="flex flex-wrap gap-2">
        {CAMPAIGN_TYPES.map((t) => (
          <button key={t.id} onClick={() => setType(t.id)}
            className={cn('rounded-lg border px-3 py-2 text-left transition-colors', type === t.id ? 'border-forge-ember/60 bg-forge-ember/10' : 'border-forge-border hover:border-forge-ember/40')}>
            <div className="text-sm font-medium text-forge-ink">{t.label}</div>
            <div className="text-[11px] text-forge-dim">{t.blurb}</div>
          </button>
        ))}
      </div>

      {/* 2) The short form */}
      {type && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {type === 'find_sellers' ? (
            <label className="sm:col-span-2 text-xs text-forge-dim">Neighborhood / town
              <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Lake Geneva" className={cn(field, 'mt-1')} />
            </label>
          ) : (
            <>
              <label className="text-xs text-forge-dim">Address
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Maple St" className={cn(field, 'mt-1')} />
              </label>
              <label className="text-xs text-forge-dim">{type === 'just_sold' ? 'Sold price (optional)' : 'Price'}
                <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$450,000" className={cn(field, 'mt-1')} />
              </label>
              <label className="text-xs text-forge-dim">Neighborhood / town (optional)
                <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Lake Geneva" className={cn(field, 'mt-1')} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-forge-dim">Beds<input value={beds} onChange={(e) => setBeds(e.target.value)} placeholder="4" className={cn(field, 'mt-1')} /></label>
                <label className="text-xs text-forge-dim">Baths<input value={baths} onChange={(e) => setBaths(e.target.value)} placeholder="3" className={cn(field, 'mt-1')} /></label>
              </div>
            </>
          )}

          {type === 'open_house' && (
            <label className="sm:col-span-2 text-xs text-forge-dim">Open house — when
              <input value={openWhen} onChange={(e) => setOpenWhen(e.target.value)} placeholder="Sat 1–3pm" className={cn(field, 'mt-1')} />
            </label>
          )}

          <label className="sm:col-span-2 text-xs text-forge-dim">{type === 'find_sellers' ? 'Your angle (what to say)' : "What's special? (one line)"}
            <input value={highlight} onChange={(e) => setHighlight(e.target.value)} placeholder={type === 'find_sellers' ? 'Homes here are moving — curious what yours is worth?' : 'Remodeled kitchen, big backyard'} className={cn(field, 'mt-1')} />
          </label>

          {/* Photo (listings) */}
          {cfg?.needsPhoto && (
            <div className="sm:col-span-2">
              <span className="text-xs text-forge-dim">Photo of the home</span>
              <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addPhoto(f); e.target.value = ''; }} />
              <div className="mt-1 flex items-center gap-2">
                {photoUrl && <img src={photoUrl} alt="" className="h-14 w-14 rounded object-cover" />}
                <button onClick={() => photoInput.current?.click()} disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-forge-border px-3 py-2 text-xs text-forge-dim hover:border-forge-ember/60 hover:text-forge-ember disabled:opacity-60">
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {photoUrl ? 'Change photo' : 'Add a photo of the home'}
                </button>
              </div>
            </div>
          )}

          {/* Who to call */}
          <label className="text-xs text-forge-dim">Your name<input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Jane Doe" className={cn(field, 'mt-1')} /></label>
          <label className="text-xs text-forge-dim">Your phone<input value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="555-0100" className={cn(field, 'mt-1')} /></label>
          <label className="sm:col-span-2 text-xs text-forge-dim">Tracking link (optional — becomes the QR)<input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={cn(field, 'mt-1')} /></label>
        </div>
      )}

      {type && (
        <button onClick={make} disabled={!canMake || busy}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-ember-gradient px-4 py-2.5 text-sm font-semibold text-[#1A0E04] shadow-soft transition-transform hover:-translate-y-px disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Make my marketing →
        </button>
      )}
      {type && !canMake && <p className="mt-2 text-[11px] text-forge-dim">{type === 'find_sellers' ? 'Add the neighborhood to continue.' : 'Add the address to continue.'}</p>}
    </div>
  );
}
