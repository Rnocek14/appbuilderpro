// src/components/garvis/canvas/PostcardBoard.tsx
// The POSTCARD adapter for the creative board. This is the exemplar Riley described: make a postcard from
// an idea or a kind (real gpt-image-1 imagery composed onto a true 6×9 card), spread many out, click one
// and tell it what to change to spawn a rendition, star + print the keepers. It plugs the postcard
// pipeline (compileMailer + PostcardFront/Back + the image-honesty gate) into the generic CreativeBoard
// shell. Honest throughout: listing cards use the real home photo (AI refused), lifestyle cards generate
// imagery, unknown facts stay [EDIT] holes, and "send" logs what was actually mailed.

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Loader2, Sparkles, Image as ImageIcon, Wand2, Star, Trash2, Send } from 'lucide-react';
import { PostcardFront, PostcardBack, PostcardViewer } from '../Postcard';
import {
  postcardKindsFor, kindById, defaultKind, buildPostcardContent, applyRendition, withPhoto, withGeneratedImage, tileAllowsAI,
  applyCopyFields, enforceListingHonesty,
  type PostcardContent, type PostcardMaterials, type PostcardCopyFields,
} from '../../../lib/garvis/postcardBoard';
import { loadPostcardMaterials, generateTileImage, logPostcardMailed } from '../../../lib/garvis/postcardBoardRun';
import { generateBoardCopy, explainCopyMiss } from '../../../lib/garvis/boardCopyRun';
import { saveMailerDesign } from '../../../lib/garvis/mailerRun';
import { inferRealEstate } from '../../../lib/garvis/studioKit';
import { CreativeBoard, type CreativeBoardAdapter, type FocusApi } from './CreativeBoard';
import { Button } from '../../ui';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

// The ONLY facts the copy seam may write from — real materials, nothing else.
const copyFacts = (m: PostcardMaterials): Record<string, unknown> => ({
  business: m.ctx?.business_name ?? null, agent: m.ctx?.principal ?? null, area: m.ctx?.locale ?? null,
  offerings: m.ctx?.offerings ?? [], audience: m.ctx?.audience ?? null, site: m.ctx?.links?.site ?? null,
  tone: m.ctx?.tone ?? null,
});

const patchFront = (c: PostcardContent, p: Partial<PostcardContent['spec']['front']>): PostcardContent =>
  ({ ...c, spec: { ...c.spec, front: { ...c.spec.front, ...p } } });
const patchBack = (c: PostcardContent, p: Partial<PostcardContent['spec']['back']>): PostcardContent =>
  ({ ...c, spec: { ...c.spec, back: { ...c.spec.back, ...p } } });

export function PostcardBoard({ worldId, clusterId, onToast, realEstate: reProp, materialsOverride }: {
  worldId: string; clusterId: string | null; onToast: Toast;
  realEstate?: boolean; materialsOverride?: PostcardMaterials;   // dev preview injects mock materials
}) {
  const [materials, setMaterials] = useState<PostcardMaterials | null>(materialsOverride ?? null);
  // Dev preview (materialsOverride) has no image key, so start with AI off — it shows the honest
  // brand-card degrade without a network round-trip. Real mounts probe the model on first Make.
  const [aiState, setAiState] = useState<'unknown' | 'on' | 'off'>(materialsOverride ? 'off' : 'unknown');

  useEffect(() => {
    if (materialsOverride) { setMaterials(materialsOverride); return; }
    let live = true;
    void (async () => {
      try { const m = await loadPostcardMaterials(worldId); if (live) setMaterials(m); }
      catch { if (live) setMaterials({ ctx: null, brand: null, images: [] }); }
    })();
    return () => { live = false; };
  }, [worldId, materialsOverride]);

  const realEstate = reProp ?? inferRealEstate(materials?.ctx?.business_name);

  const adapter = useMemo<CreativeBoardAdapter<PostcardContent> | null>(() => {
    if (!materials) return null;

    const tryImage = async (content: PostcardContent, style: string | null): Promise<PostcardContent> => {
      const r = await generateTileImage({ content, materials, clusterId, style });
      if (r.ok) { setAiState('on'); return r.content; }
      if (r.kind === 'unavailable') { setAiState('off'); onToast('info', 'AI images aren’t connected yet — using your brand design. Connect an image key to generate photos.'); }
      else if (r.kind === 'error') onToast('error', r.message);
      // 'refused' can't happen for AI-allowed kinds; keep the honest brand/photo card
      return content;
    };

    return {
      storageKey: 'postcard',
      title: 'Postcard board',
      subtitle: 'Make one, then another — spread them out, compare, tell one what to change, star the keepers, print.',
      metrics: { w: 248, h: 165, gap: 26, cols: 3, pad: 40 },
      designWidth: 340,
      promptPlaceholder: realEstate ? 'an idea… e.g. “lakefront sunset, elegant, thinking of selling”' : 'an idea… e.g. “grand-opening, warm and bold”',
      emptyHint: 'Pick a kind, type an idea, and hit Make. Your postcards appear here — make as many as you like, then compare and print the best.',
      kinds: postcardKindsFor(realEstate).map((k) => ({ id: k.id, label: k.label, emoji: k.emoji, hint: k.hint })),
      banner: aiState === 'off'
        ? '🎨 AI imagery is off — cards use your brand design and real photos. Connect an image key to generate imagery.'
        : 'Real facts fill in; anything unknown shows as an [EDIT] you complete. Nothing mails from here — print, then log what you sent.',
      captionOf: (c) => `${kindById(c.kindId)?.label ?? 'Postcard'}${c.imageMode === 'ai' ? ' · AI image' : c.imageMode === 'photo' ? ' · photo' : ' · brand'}`,
      qualityOf: (c) => c.quality ?? null,
      references: [
        ...(materials.brand?.palette?.length ? [{ label: 'Brand palette', swatches: materials.brand.palette }] : []),
        ...materials.images.slice(0, 8).map((i) => ({ label: i.caption || i.label || 'your photo', url: i.url })),
      ],

      generate: async ({ prompt, kindId }) => {
        const kind = (kindId && kindById(kindId)) || defaultKind(realEstate);
        let content = buildPostcardContent({ materials, kind, idea: prompt });
        // The typed idea reaches the WORDS: the board-copy seam writes real headline/body/cta from the
        // idea + the real materials ([EDIT] holes for unknowns). Falls back to the honest template
        // when the seam is off or errors — the card is still made, never blocked on AI.
        if (prompt.trim()) {
          const ai = await generateBoardCopy({
            channel: 'postcard', mode: 'make', instruction: prompt, kindLabel: kind.label,
            materials: copyFacts(materials),
          });
          if (!ai.ok) explainCopyMiss(ai, onToast);
          if (ai.ok) content = { ...applyCopyFields(content, ai.fields as PostcardCopyFields), quality: ai.quality };
        }
        if (!kind.needsRealPhoto && tileAllowsAI(content) && aiState !== 'off') {
          content = await tryImage(content, prompt || null);
        }
        return content;
      },

      rendition: async ({ parent, instruction }) => {
        const r = applyRendition(parent, instruction);
        let content = r.content;
        // The instruction reaches the words too — revise the current piece, keep what it got right.
        if (instruction.trim()) {
          const ai = await generateBoardCopy({
            channel: 'postcard', mode: 'rendition', instruction, kindLabel: kindById(parent.kindId)?.label ?? null,
            materials: copyFacts(materials),
            current: { headline: parent.spec.front.headline, sub: parent.spec.front.kicker, body: parent.spec.back.body, cta: parent.spec.back.cta },
          });
          if (!ai.ok) explainCopyMiss(ai, onToast);
          if (ai.ok) content = { ...applyCopyFields(content, ai.fields as PostcardCopyFields), quality: ai.quality };
        }
        if (r.wantsImage && aiState !== 'off') return tryImage(content, r.imageStyle);
        return content;
      },

      renderThumb: (c) => <PostcardFront spec={c.spec} accent={c.spec.accent} variant={c.variant} />,

      renderFocus: (c, api) => (
        <PostcardFocus content={c} api={api} materials={materials} worldId={worldId} clusterId={clusterId} onToast={onToast} tryImage={tryImage} />
      ),

      renderPrint: (c) => <PostcardPrintPiece content={c} />,
      printCss: POSTCARD_PRINT_CSS,
    };
  }, [materials, realEstate, aiState, clusterId, worldId, onToast]);

  if (!materials || !adapter) {
    return <div className="grid h-full min-h-[400px] place-items-center"><Loader2 size={20} className="animate-spin text-forge-ember" /></div>;
  }
  return <CreativeBoard adapter={adapter} clusterId={clusterId} onToast={onToast} />;
}

// ---- the focus/edit view for one postcard --------------------------------------------------

function PostcardFocus({ content, api, materials, worldId, clusterId, onToast, tryImage }: {
  content: PostcardContent; api: FocusApi<PostcardContent>; materials: PostcardMaterials;
  worldId: string; clusterId: string | null; onToast: Toast;
  tryImage: (c: PostcardContent, style: string | null) => Promise<PostcardContent>;
}) {
  const [genBusy, setGenBusy] = useState(false);
  const [genStyle, setGenStyle] = useState('');
  const [pickPhoto, setPickPhoto] = useState(false);
  const [spinText, setSpinText] = useState('');
  const [mailCount, setMailCount] = useState('');
  const allowsAI = tileAllowsAI(content);
  const kind = kindById(content.kindId);
  const qr = useQr(content.spec.back.qrUrl);   // a real scannable QR, not the raw destination URL

  const genImage = async () => {
    setGenBusy(true);
    try {
      const next = await tryImage(content, genStyle.trim() || null);
      // Apply ONLY the new image onto the latest content, so a text edit made while it was generating
      // isn't clobbered by this pre-generation snapshot.
      if (next.imageMode === 'ai' && next.spec.front.imageUrl) {
        const url = next.spec.front.imageUrl, note = next.aiNote;
        api.update((prev) => withGeneratedImage(prev, url, note));
      }
    } finally { setGenBusy(false); }
  };

  const logMailed = async () => {
    const n = Math.max(1, parseInt(mailCount || '0', 10) || 0);
    try {
      await logPostcardMailed({ worldId, clusterId, title: content.spec.front.headline || 'Postcard', pieceCount: n, status: 'mailed' });
      onToast('success', `Logged ${n} mailed — it counts toward this world’s outreach.`);
      setMailCount('');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not log the batch.'); }
  };

  // BOARD → MAIL RUN: a starred lab card becomes THE design the farm merge uses — no recreating it in
  // the designer. Per-tile slug so runs never overwrite each other.
  const [runBusy, setRunBusy] = useState(false);
  const useForMailRun = async () => {
    if (!clusterId) { onToast('info', 'This board isn’t linked to a workspace yet — open it from your business canvas.'); return; }
    setRunBusy(true);
    try {
      await saveMailerDesign(clusterId, content.spec, `${content.spec.front.headline || 'Postcard'} — mail run`, `postcard-run-${api.id.slice(0, 8)}`);
      onToast('success', 'Saved as a mail-run design. Open “People nearby” on the canvas to pick the area, download the mail-house list, and print.');
    } catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not save the design.'); }
    finally { setRunBusy(false); }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">{kind?.emoji} {kind?.label ?? 'Postcard'}</span>
        {content.imageMode === 'ai' && <span className="rounded-full bg-forge-ember/15 px-2 py-0.5 text-[10px] text-forge-ember">AI image</span>}
      </div>

      <PostcardViewer spec={content.spec} accent={content.spec.accent} qr={qr} variant={content.variant} />
      {content.aiNote && <p className="mt-1 text-[10px] text-forge-dim/80">{content.aiNote}</p>}

      {/* image actions */}
      <div className="mt-3 rounded-lg border border-forge-border bg-forge-panel/40 p-2.5">
        <p className="mb-1.5 text-[11px] font-medium text-forge-dim">The image</p>
        {allowsAI ? (
          <div className="flex items-center gap-2">
            <input value={genStyle} onChange={(e) => setGenStyle(e.target.value)} placeholder="describe it — e.g. golden hour, minimal, moody"
              className="flex-1 rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
            <Button variant="outline" size="sm" onClick={() => void genImage()} disabled={genBusy}>
              {genBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-forge-dim">This is a listing card — it must show the <b>real home photo</b>, so pick one below (AI images would misrepresent a specific property).</p>
        )}
        {materials.images.length > 0 && (
          <div className="mt-2">
            <button onClick={() => setPickPhoto((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-forge-dim hover:text-forge-ember"><ImageIcon size={12} /> Use one of your photos ({materials.images.length})</button>
            {pickPhoto && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {materials.images.slice(0, 12).map((img) => (
                  <button key={img.url} onClick={() => api.update(withPhoto(content, img.url, img.caption))}
                    className="h-12 w-16 overflow-hidden rounded border border-forge-border hover:border-forge-ember">
                    <img src={img.url} alt={img.caption ?? ''} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* words */}
      <div className="mt-2 space-y-2">
        <Field label="Front headline" value={content.spec.front.headline} onChange={(v) => {
          // The listing-honesty backstop: typing a listing claim ("Just Sold…") reclassifies the card
          // to the listing type — which requires the real home photo, so any AI image comes off.
          const r = enforceListingHonesty(patchFront(content, { headline: v }));
          if (r.reclassified) onToast('info', `That’s a listing claim — this card now needs the real home photo${r.strippedAI ? ', so the AI image was removed' : ''}.`);
          api.update(r.content);
        }} />
        <Field label="Back headline" value={content.spec.back.headline} onChange={(v) => api.update(patchBack(content, { headline: v }))} />
        <Field label="Body" value={content.spec.back.body} onChange={(v) => api.update(patchBack(content, { body: v }))} multiline />
        <Field label="Offer" value={content.spec.back.offer} onChange={(v) => api.update(patchBack(content, { offer: v }))} />
        <Field label="Call to action" value={content.spec.back.cta} onChange={(v) => api.update(patchBack(content, { cta: v }))} />
      </div>
      <p className="mt-1 text-[10px] text-forge-dim/80"><span className="text-forge-ember">[EDIT: …]</span> marks are yours to fill — Garvis never invents a fact.</p>

      {/* rendition + organize */}
      <div className="mt-3 rounded-lg border border-forge-border bg-forge-panel/40 p-2.5">
        <p className="mb-1.5 text-[11px] font-medium text-forge-dim">Another idea? Spin a rendition (keeps this one)</p>
        <div className="flex items-center gap-2">
          <input value={spinText} onChange={(e) => setSpinText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && spinText.trim()) { void api.rendition(spinText); setSpinText(''); } }}
            placeholder="warmer · punchier headline · more white space"
            className="flex-1 rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          <Button variant="outline" size="sm" disabled={!spinText.trim()} onClick={() => { void api.rendition(spinText); setSpinText(''); }}><Wand2 size={13} /> Spin</Button>
        </div>
      </div>

      {/* actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant={api.isFavorite ? 'primary' : 'outline'} size="sm" onClick={api.favorite}>
          <Star size={13} className={api.isFavorite ? 'fill-current' : ''} /> {api.isFavorite ? 'Starred' : 'Star'}
        </Button>
        <Button variant="ghost" size="sm" onClick={api.remove}><Trash2 size={13} /> Delete</Button>
        <Button variant="outline" size="sm" disabled={runBusy} onClick={() => void useForMailRun()} title="Make this the design your farm mail run uses">
          {runBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Use for mail run
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <input value={mailCount} onChange={(e) => setMailCount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="#" style={{ width: 52 }}
            className="rounded-md border border-forge-border bg-forge-bg px-2 py-1.5 text-[12px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
          <Button variant="outline" size="sm" disabled={!mailCount} onClick={() => void logMailed()} title="Print first, then log what you actually mailed"><Send size={13} /> Log mailed</Button>
        </div>
      </div>
    </div>
  );
}

/** Render a destination URL into a real scannable QR data-URL (PostcardBack draws it as an <img>).
 *  Returns null while pending / when there's no link, so the back shows its gray placeholder. */
function useQr(url: string | null): string | null {
  const [data, setData] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!url) { setData(null); return; }
    QRCode.toDataURL(url, { margin: 1, width: 240 }).then((d) => { if (live) setData(d); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [url]);
  return data;
}

/** A full print-size piece (front + back) with a real QR — used for Export/Print. */
function PostcardPrintPiece({ content }: { content: PostcardContent }) {
  const qr = useQr(content.spec.back.qrUrl);
  return (
    <>
      <PostcardFront spec={content.spec} accent={content.spec.accent} variant={content.variant} />
      <PostcardBack spec={content.spec} accent={content.spec.accent} qr={qr} />
    </>
  );
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10.5px] font-medium text-forge-dim">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={Math.min(5, Math.max(2, value.split('\n').length + 1))}
          className="w-full resize-y rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12.5px] leading-relaxed text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[13px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
      )}
    </label>
  );
}

const POSTCARD_PRINT_CSS = `
@media print{
  body *{visibility:hidden !important}
  .cb-print, .cb-print *{visibility:visible !important}
  .cb-print{position:absolute !important;left:0;top:0;width:100%}
  .cb-print .mailer-card{width:9.25in !important;height:6.25in !important;border-radius:0 !important;box-shadow:none !important;page-break-after:always;break-after:page}
  @page{size:9.25in 6.25in;margin:0}
}
`;
