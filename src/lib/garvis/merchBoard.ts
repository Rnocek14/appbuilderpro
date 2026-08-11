// src/lib/garvis/merchBoard.ts
// THE MERCH BOARD's pure core — garment concept cards for a capsule (tees, hats, polos, crews,
// totes). A card is a SPEC, not a print proof: garment, placement, design text, a disciplined
// palette, and the operator's OWN cost numbers run through the verified costSheet core. No AI
// anywhere in this core — concepts are deterministic from the brand materials and the idea, and
// renditions are parsed instructions ("small logo on the front pocket" moves the placement).
// Honesty: costs are the operator's numbers, labeled as such; real quotes come from the printer.

import { costSheet, type CostSheet } from './costSheet';

export type GarmentId = 'tee' | 'hat' | 'polo' | 'crewneck' | 'tote';
export type PlacementId = 'front' | 'front_pocket' | 'back' | 'side';
export type PrintScale = 'small' | 'regular' | 'large';

export interface MerchCostInput {
  blankUnitUsd: number;
  decorationUnitUsd: number;
  runFixedUsd: number;
  units: number;
  pricePointUsd: number;
}

export interface MerchContent {
  garment: GarmentId;
  placement: PlacementId;
  scale: PrintScale;
  designText: string;          // what the garment carries — monogram, wordmark, or the idea
  baseColor: string;           // garment body
  inkColor: string;            // the print
  maxColors: number | null;    // print discipline (a two-color run prints cheaper)
  note: string | null;         // the operator's idea, verbatim
  refImageUrl: string | null;  // a dropped reference photo (crest scan, inspiration shot)
  cost: MerchCostInput;        // THIS operator's numbers — editable on the card
}

export interface MerchMaterials {
  businessName: string | null;
  palette: string[];           // brand palette, first = primary
}

export interface GarmentKind { id: GarmentId; label: string; emoji: string; hint: string }

export const GARMENTS: GarmentKind[] = [
  { id: 'tee', label: 'Tee', emoji: '👕', hint: 'The staple — front or back print.' },
  { id: 'hat', label: 'Hat', emoji: '🧢', hint: 'Embroidered front — small marks read best.' },
  { id: 'polo', label: 'Polo', emoji: '🎽', hint: 'Left-chest embroidery — the club look.' },
  { id: 'crewneck', label: 'Crewneck', emoji: '🧥', hint: 'Big canvas — chest or full back.' },
  { id: 'tote', label: 'Tote', emoji: '👜', hint: 'One bold side print.' },
];

export function garmentById(id: string): GarmentKind | null {
  return GARMENTS.find((g) => g.id === id) ?? null;
}

/** Sensible STARTING cost numbers per garment — visibly defaults, meant to be overwritten with
 *  the printer's real quote. Price points start where a premium club capsule usually lands. */
export const DEFAULT_COSTS: Record<GarmentId, MerchCostInput> = {
  tee: { blankUnitUsd: 6, decorationUnitUsd: 4.5, runFixedUsd: 60, units: 48, pricePointUsd: 32 },
  hat: { blankUnitUsd: 9, decorationUnitUsd: 5.5, runFixedUsd: 75, units: 48, pricePointUsd: 35 },
  polo: { blankUnitUsd: 14, decorationUnitUsd: 6, runFixedUsd: 75, units: 36, pricePointUsd: 55 },
  crewneck: { blankUnitUsd: 15, decorationUnitUsd: 5.5, runFixedUsd: 60, units: 36, pricePointUsd: 58 },
  tote: { blankUnitUsd: 4, decorationUnitUsd: 3.5, runFixedUsd: 50, units: 72, pricePointUsd: 25 },
};

/** The default mark when no idea is typed: the business's initials as a monogram. */
export function monogramOf(businessName: string | null): string {
  const words = (businessName ?? '').split(/\s+/).map((w) => w.trim()).filter((w) => /^[a-z0-9]/i.test(w));
  const mono = words.map((w) => w[0]!.toUpperCase()).join('').slice(0, 4);
  return mono || 'LOGO';
}

/** Build a concept card from the brand materials + the idea. Deterministic; the palette decides
 *  body and ink (dark primary body, light ink) with honest fallbacks when there's no brand yet. */
export function buildMerchContent(args: { materials: MerchMaterials; garment: GarmentId; idea: string }): MerchContent {
  const { materials, garment, idea } = args;
  const base = materials.palette[0] ?? '#1F3D2B';
  const ink = materials.palette[1] ?? '#F3EBDD';
  // A SHORT idea is mark text ("Como", "EST. 1924"); a long one is a description — the card
  // keeps the monogram as its mark and the description lives in the note.
  const t = idea.trim();
  const text = t && t.length <= 24 ? t : monogramOf(materials.businessName);
  return {
    garment,
    placement: garment === 'hat' ? 'front' : garment === 'polo' ? 'front_pocket' : 'front',
    scale: garment === 'hat' || garment === 'polo' ? 'small' : 'regular',
    designText: text,
    baseColor: base,
    inkColor: ink,
    maxColors: null,
    note: idea.trim() || null,
    refImageUrl: null,
    cost: { ...DEFAULT_COSTS[garment] },
  };
}

const NAMED_COLORS: Record<string, string> = {
  green: '#1F3D2B', 'forest green': '#1F3D2B', cream: '#F3EBDD', white: '#FFFFFF', black: '#111111',
  navy: '#1B2A4A', red: '#B3282D', gold: '#C9A227', tan: '#D2B48C', grey: '#8A8A8A', gray: '#8A8A8A',
};

/** Apply a spoken/typed change to a card — the same instructions the suggestion chips send.
 *  Placement, scale, garment, color words, and color-count discipline are all recognized;
 *  anything else keeps the card and lands in the note so nothing said is lost. */
export function applyMerchRendition(parent: MerchContent, instruction: string): MerchContent {
  const t = instruction.toLowerCase();
  let next: MerchContent = { ...parent, cost: { ...parent.cost }, note: instruction.trim() || parent.note };

  if (/\bpocket\b/.test(t)) next = { ...next, placement: 'front_pocket', scale: 'small' };
  else if (/\bback\b/.test(t)) next = { ...next, placement: 'back', scale: /\b(large|big|bold)\b/.test(t) ? 'large' : next.scale };
  else if (/\b(sleeve|side)\b/.test(t)) next = { ...next, placement: 'side', scale: 'small' };
  else if (/\bfront\b/.test(t)) next = { ...next, placement: 'front' };

  if (/\b(small|subtle|tiny)\b/.test(t)) next = { ...next, scale: 'small' };
  else if (/\b(large|big|bold|huge)\b/.test(t)) next = { ...next, scale: 'large' };

  const colorCount = /\b(one|1)[- ]?colou?r/.exec(t) ? 1 : /\b(two|2)[- ]?colou?rs?/.exec(t) ? 2 : /\b(three|3)[- ]?colou?rs?/.exec(t) ? 3 : null;
  if (colorCount) next = { ...next, maxColors: colorCount };

  for (const g of GARMENTS) {
    const words = g.id === 'tee' ? ['tee', 't-shirt', 'tshirt', 'shirt'] : g.id === 'hat' ? ['hat', 'cap'] : [g.id];
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) { next = { ...next, garment: g.id, cost: { ...DEFAULT_COSTS[g.id] } }; break; }
  }

  // "cream on green" — the ON color is the body, the other is the ink.
  const on = /([a-z ]+?) on ([a-z ]+)/.exec(t);
  const named = (s: string): string | null => {
    const hit = Object.keys(NAMED_COLORS).sort((a, b) => b.length - a.length).find((k) => s.includes(k));
    return hit ? NAMED_COLORS[hit] : null;
  };
  if (on) {
    const inkC = named(on[1]);
    const baseC = named(on[2]);
    if (inkC) next = { ...next, inkColor: inkC };
    if (baseC) next = { ...next, baseColor: baseC };
  } else {
    const c = named(t);
    if (c) next = { ...next, inkColor: c };
  }

  return next;
}

/** A dropped reference photo (crest scan, inspiration) rides on the card. */
export function withRefImage(content: MerchContent, url: string): MerchContent {
  return { ...content, refImageUrl: url };
}

/** The card's cost read — the operator's numbers through the verified costSheet core. */
export function merchCost(content: MerchContent): CostSheet {
  const c = content.cost;
  return costSheet({
    blankUnitUsd: c.blankUnitUsd, decorationUnitUsd: c.decorationUnitUsd,
    runFixedUsd: c.runFixedUsd, units: c.units, pricePointsUsd: [c.pricePointUsd],
  });
}

export const PLACEMENT_LABEL: Record<PlacementId, string> = {
  front: 'front', front_pocket: 'front pocket', back: 'back print', side: 'side',
};

export function merchCaption(content: MerchContent): string {
  const g = garmentById(content.garment)?.label ?? 'Piece';
  const colors = content.maxColors ? ` · ${content.maxColors}-color` : '';
  return `${g} · ${PLACEMENT_LABEL[content.placement]}${colors}`;
}
