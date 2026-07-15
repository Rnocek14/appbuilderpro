// src/components/garvis/canvas/BrandBoard.tsx
// The BRANDING adapter for the creative board. Make logo concepts from your real brand (name + palette),
// spread many out, spin renditions ("more minimal", "warmer"), star the keeper, set it as your brand
// logo. A logo IS the generated image, so this board needs an image key — without one it says so plainly
// (honest degrade) rather than faking a mark.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, Download } from 'lucide-react';
import {
  LOGO_STYLES, logoStyleById, defaultLogoStyle, buildBrandContent, applyBrandRendition,
  type BrandContent, type BrandMaterials,
} from '../../../lib/garvis/brandBoard';
import { loadBrandMaterials, generateLogo, setBrandLogo } from '../../../lib/garvis/brandBoardRun';
import { CreativeBoard, type CreativeBoardAdapter, type FocusApi } from './CreativeBoard';
import { Button } from '../../ui';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function BrandBoard({ worldId, clusterId, onToast, materialsOverride }: {
  worldId: string; clusterId: string | null; onToast: Toast; materialsOverride?: BrandMaterials;
}) {
  const [materials, setMaterials] = useState<BrandMaterials | null>(materialsOverride ?? null);
  const [aiState, setAiState] = useState<'unknown' | 'on' | 'off'>(materialsOverride ? 'off' : 'unknown');

  useEffect(() => {
    if (materialsOverride) { setMaterials(materialsOverride); return; }
    let live = true;
    void (async () => {
      try { const m = await loadBrandMaterials(worldId); if (live) setMaterials(m); }
      catch { if (live) setMaterials({ businessName: '', palette: [], logoUrl: null, realEstate: false }); }
    })();
    return () => { live = false; };
  }, [worldId, materialsOverride]);

  const adapter = useMemo<CreativeBoardAdapter<BrandContent> | null>(() => {
    if (!materials) return null;

    const tryLogo = async (content: BrandContent, extra: string | null): Promise<BrandContent> => {
      const r = await generateLogo({ content, materials, clusterId, extra });
      if (r.ok) { setAiState('on'); return r.content; }
      if (r.kind === 'unavailable') { setAiState('off'); onToast('info', 'Logo generation needs an image key — connect one to generate concepts.'); }
      else onToast('error', r.message);
      return content;
    };

    return {
      storageKey: 'brand',
      title: 'Branding board',
      subtitle: 'Generate logo concepts from your palette — spread them out, restyle, star a keeper, set it as your logo.',
      metrics: { w: 200, h: 200, gap: 26, cols: 4, pad: 40 },
      designWidth: 200,
      promptPlaceholder: 'a nudge… e.g. “minimal, single color, waves”',
      emptyHint: aiState === 'off'
        ? 'Logo generation needs an image key. Connect one and pick a style to generate concepts from your palette.'
        : 'Pick a style, add a nudge, and hit Make. Logo concepts appear here — restyle, compare, and set your favorite as the brand logo.',
      kinds: LOGO_STYLES.map((s) => ({ id: s.id, label: s.label, emoji: s.emoji, hint: s.hint })),
      banner: aiState === 'off'
        ? '🎨 Logo generation needs an image key. These are concepts, not final art — you add the wordmark.'
        : 'Logo concepts are a starting point (not final/trademarked). Built from your palette; you add the wordmark.',
      captionOf: (c) => logoStyleById(c.styleId)?.label ?? 'Logo',
      searchText: (c) => `${c.styleId} ${c.prompt}`,
      generate: async ({ prompt, kindId }) => {
        const style = (kindId && logoStyleById(kindId)) || defaultLogoStyle(materials.realEstate);
        const content = buildBrandContent({ materials, style, extra: prompt || null });
        return aiState !== 'off' ? tryLogo(content, prompt || null) : content;
      },
      rendition: async ({ parent, instruction }) => {
        const r = applyBrandRendition(parent, instruction, materials);
        return aiState !== 'off' ? tryLogo(r.content, r.imageStyle) : r.content;
      },
      renderThumb: (c) => <LogoCard content={c} materials={materials} />,
      renderFocus: (c, api) => <BrandFocus content={c} api={api} materials={materials} worldId={worldId} clusterId={clusterId} onToast={onToast} tryLogo={tryLogo} />,
    };
  }, [materials, aiState, clusterId, worldId, onToast]);

  if (!materials || !adapter) {
    return <div className="grid h-full min-h-[400px] place-items-center"><Loader2 size={20} className="animate-spin text-forge-ember" /></div>;
  }
  return <CreativeBoard adapter={adapter} clusterId={clusterId} onToast={onToast} />;
}

function LogoCard({ content, materials }: { content: BrandContent; materials: BrandMaterials }) {
  const style = logoStyleById(content.styleId);
  if (content.imageUrl) {
    return <div style={{ aspectRatio: '1 / 1', borderRadius: 14, overflow: 'hidden', background: '#fff' }}><img src={content.imageUrl} alt={style?.label ?? 'logo'} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} /></div>;
  }
  // No image yet (key off / pending) — a placeholder showing the style + the palette it would use.
  return (
    <div style={{ aspectRatio: '1 / 1', borderRadius: 14, display: 'grid', placeItems: 'center', gap: 8, background: 'linear-gradient(140deg,#1c1710,#0f0b07)', border: '1px dashed #3a2f25' }}>
      <div style={{ fontSize: 26 }}>{style?.emoji ?? '◆'}</div>
      <div style={{ fontSize: 11, color: '#a99b90', textAlign: 'center', padding: '0 8px' }}>{style?.label ?? 'Logo'} — concept</div>
      <div style={{ display: 'flex', gap: 4 }}>{(materials.palette.length ? materials.palette : ['#ff8a3d']).slice(0, 4).map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />)}</div>
    </div>
  );
}

function BrandFocus({ content, api, materials, worldId, clusterId, onToast, tryLogo }: {
  content: BrandContent; api: FocusApi<BrandContent>; materials: BrandMaterials;
  worldId: string; clusterId: string | null; onToast: Toast;
  tryLogo: (c: BrandContent, extra: string | null) => Promise<BrandContent>;
}) {
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState('');
  const style = logoStyleById(content.styleId);

  const regen = async () => {
    setBusy(true);
    try {
      const next = await tryLogo(content, extra.trim() || null);
      if (next.imageUrl && next.imageUrl !== content.imageUrl) { const url = next.imageUrl; api.update((prev) => ({ ...prev, imageUrl: url, note: next.note })); }
    } finally { setBusy(false); }
  };
  const setAsLogo = async () => {
    if (!content.imageUrl) return;
    try { await setBrandLogo(worldId, content.imageUrl); onToast('success', 'Set as your brand logo. It’ll flow into your postcards, social, and site.'); }
    catch (e) { onToast('error', e instanceof Error ? e.message : 'Could not set the logo.'); }
  };

  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-forge-ember/80">{style?.emoji} {style?.label ?? 'Logo'} concept</div>
      <div className="mx-auto grid aspect-square w-full max-w-[320px] place-items-center overflow-hidden rounded-2xl bg-white">
        {content.imageUrl
          ? <img src={content.imageUrl} alt={style?.label ?? 'logo'} className="h-full w-full object-contain" />
          : <div className="p-6 text-center text-[12px] text-neutral-400">No concept yet — {materials.realEstate ? '' : ''}generate one below (needs an image key).</div>}
      </div>
      {content.note && <p className="mt-1 text-[10px] text-forge-dim/80">{content.note}</p>}

      <div className="mt-3 flex items-center gap-2">
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="restyle — e.g. more minimal, single color, waves"
          className="flex-1 rounded-md border border-forge-border bg-forge-bg px-2.5 py-1.5 text-[12px] text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
        <Button variant="outline" size="sm" onClick={() => void regen()} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generate</Button>
      </div>

      {/* palette reference */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10.5px] uppercase tracking-wide text-forge-dim">Palette</span>
        {(materials.palette.length ? materials.palette : ['#FF8A3D']).slice(0, 6).map((c) => <span key={c} title={c} className="h-5 w-5 rounded" style={{ background: c }} />)}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => void setAsLogo()} disabled={!content.imageUrl}><CheckCircle2 size={13} /> Set as brand logo</Button>
        {content.imageUrl && <a href={content.imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-forge-border px-3 py-1.5 text-xs text-forge-ink hover:border-forge-ember/50"><Download size={13} /> Open / download</a>}
        <Button variant={api.isFavorite ? 'primary' : 'ghost'} size="sm" onClick={api.favorite}>{api.isFavorite ? '★' : '☆'}</Button>
      </div>
    </div>
  );
}
