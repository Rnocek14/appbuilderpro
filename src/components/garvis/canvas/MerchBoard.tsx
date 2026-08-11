// src/components/garvis/canvas/MerchBoard.tsx
// The MERCH adapter for the creative board — the capsule workspace (tees, hats, polos, crews,
// totes). Cards are SPECS built purely from the brand (no AI): garment, placement, mark, a
// disciplined palette, and the operator's own cost numbers through the verified costSheet core.
// Renditions are parsed instructions ("small logo on the front pocket"), so the suggestion chips
// and spoken asks work the day this mounts. Honesty: concept cards, not print proofs — the cost
// line always says whose numbers these are.

import { useEffect, useMemo, useState } from 'react';
import {
  buildMerchContent, applyMerchRendition, merchCost, merchCaption, withRefImage,
  GARMENTS, PLACEMENT_LABEL, garmentById,
  type GarmentId, type MerchContent, type MerchMaterials,
} from '../../../lib/garvis/merchBoard';
import { loadBrandMaterials, loadResearchNotes } from '../../../lib/garvis/brandBoardRun';
import { uploadClusterFile } from '../../../lib/garvis/artifacts';
import { CreativeBoard, type CreativeBoardAdapter, type FocusApi } from './CreativeBoard';
import { cn } from '../../../lib/utils';

type Toast = (k: 'success' | 'error' | 'info', m: string) => void;

export function MerchBoard({ worldId, clusterId, onToast }: {
  worldId: string; clusterId: string | null; onToast: Toast;
}) {
  const [materials, setMaterials] = useState<MerchMaterials | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [research, setResearch] = useState<{ title: string; body: string }[]>([]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const m = await loadBrandMaterials(worldId);
        if (live) { setMaterials({ businessName: m.businessName || null, palette: m.palette }); setLogoUrl(m.logoUrl); }
      } catch { if (live) setMaterials({ businessName: null, palette: [] }); }
      const notes = await loadResearchNotes(worldId).catch(() => []);
      if (live) setResearch(notes);
    })();
    return () => { live = false; };
  }, [worldId]);

  const adapter = useMemo<CreativeBoardAdapter<MerchContent> | null>(() => {
    if (!materials) return null;
    return {
      storageKey: 'merch',
      voiceNouns: ['shirt', 't-shirt', 'tshirt', 'tee', 'hat', 'cap', 'polo', 'crewneck', 'hoodie', 'tote', 'merch'],
      title: 'Merch board',
      subtitle: 'Garment concepts from your brand — spread them out, move the mark, discipline the colors, put real numbers on the keepers.',
      metrics: { w: 220, h: 235, gap: 26, cols: 3, pad: 40 },
      designWidth: 220,
      kinds: GARMENTS.map((g) => ({ id: g.id, label: g.label, emoji: g.emoji, hint: g.hint })),
      promptPlaceholder: 'an idea… e.g. “Como script across the chest, cream on green”',
      emptyHint: 'Pick a garment, type the idea, hit Make. Concept cards land here — tell one what to change (“small logo on front pocket”), then put YOUR printer numbers on the keeper.',
      banner: 'Concept cards, not print proofs — the costs are your numbers (open a card to edit them); real quotes come from your printer.',
      captionOf: merchCaption,
      references: [
        ...(materials.palette.length ? [{ label: 'Brand palette', swatches: materials.palette }] : []),
        ...(logoUrl ? [{ label: 'Your logo', url: logoUrl }] : []),
      ],
      research,
      generate: async ({ prompt, kindId }) =>
        buildMerchContent({ materials, garment: (garmentById(kindId ?? '')?.id ?? 'tee') as GarmentId, idea: prompt }),
      rendition: async ({ parent, instruction }) => applyMerchRendition(parent, instruction),
      searchText: (c) => `${c.designText} ${c.note ?? ''} ${c.garment}`,
      // A dropped photo (crest scan, inspiration shot) saves to the vault and rides the card.
      acceptPhoto: async (file) => {
        if (!clusterId) throw new Error('this area is still setting up — give it a second and drop it again');
        const f = await uploadClusterFile(clusterId, file, {
          caption: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80) || null,
          label: 'dropped',
        });
        return { url: f.url, caption: f.caption };
      },
      applyPhoto: (c, url) => withRefImage(c, url),
      renderThumb: (c) => <MerchMock content={c} small />,
      renderFocus: (c, api) => <MerchFocus content={c} api={api} />,
    };
  }, [materials, logoUrl, research, clusterId]);

  if (!adapter) return null;
  return <CreativeBoard adapter={adapter} clusterId={clusterId} onToast={onToast} />;
}

/** The garment mock — body color, the mark where the placement says, honest and simple. */
function MerchMock({ content: c, small = false }: { content: MerchContent; small?: boolean }) {
  const fontSize = c.scale === 'small' ? (small ? 9 : 13) : c.scale === 'large' ? (small ? 17 : 28) : (small ? 12 : 19);
  return (
    <div style={{ background: c.baseColor }} className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg">
      <span className="absolute left-1.5 top-1 text-[14px] opacity-40" aria-hidden>{garmentById(c.garment)?.emoji}</span>
      {c.refImageUrl && <img src={c.refImageUrl} alt="reference" className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded object-cover opacity-90" />}
      <span
        style={{ color: c.inkColor, fontSize }}
        className={cn('max-w-full px-2 text-center font-semibold tracking-wide',
          c.placement === 'front_pocket' && 'absolute left-3 top-7 max-w-[60%] text-left',
          c.placement === 'side' && 'absolute right-1 top-1/2 -translate-y-1/2 rotate-90')}>
        {c.designText}
      </span>
      <span className="absolute bottom-1 left-1.5 text-[8px] uppercase tracking-wider" style={{ color: c.inkColor, opacity: 0.55 }}>
        {PLACEMENT_LABEL[c.placement]}{c.maxColors ? ` · ${c.maxColors}-color` : ''}
      </span>
    </div>
  );
}

/** The open card: the mock at size + the cost sheet with THIS operator's editable numbers. */
function MerchFocus({ content: c, api }: { content: MerchContent; api: FocusApi<MerchContent> }) {
  const sheet = merchCost(c);
  const set = (patch: Partial<MerchContent['cost']>) =>
    api.update((prev) => ({ ...prev, cost: { ...prev.cost, ...patch } }));
  return (
    <div className="space-y-3">
      <div className="h-64"><MerchMock content={c} /></div>
      <div>
        <p className="text-xs font-semibold text-forge-ink">Your numbers — edit to match the printer’s quote</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <CostField label="Blank $/unit" value={c.cost.blankUnitUsd} onChange={(n) => set({ blankUnitUsd: n })} />
          <CostField label="Decoration $/unit" value={c.cost.decorationUnitUsd} onChange={(n) => set({ decorationUnitUsd: n })} />
          <CostField label="Run fixed $" value={c.cost.runFixedUsd} onChange={(n) => set({ runFixedUsd: n })} />
          <CostField label="Units" value={c.cost.units} onChange={(n) => set({ units: Math.round(n) })} />
          <CostField label="Sell price $" value={c.cost.pricePointUsd} onChange={(n) => set({ pricePointUsd: n })} />
        </div>
        <p className="mt-2 text-[11px] text-forge-ink">{sheet.reads[0]}</p>
        <p className="mt-0.5 text-[10px] text-forge-dim">
          Landed ${sheet.landedUnitUsd.toFixed(2)}/unit · whole run ${sheet.runTotalUsd.toFixed(2)}. Starting numbers are defaults — a real quote from your printer replaces them.
        </p>
      </div>
      {c.note && <p className="text-[11px] text-forge-dim">Idea: {c.note}</p>}
    </div>
  );
}

function CostField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] text-forge-dim">{label}</span>
      <input type="number" step="0.5" min={0} value={value}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) onChange(n); }}
        className="mt-0.5 w-full rounded-lg border border-forge-border bg-forge-bg px-2 py-1 text-xs text-forge-ink focus:border-forge-ember/60 focus:outline-none" />
    </label>
  );
}
