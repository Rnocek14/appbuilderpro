// src/lib/preview/automationMenu.ts
// THE PICK-WHAT-YOU-WANT MENU — pure core for the ClaimBar's add-on picker. The cold email
// deliberately carries no per-item prices (a stack of "(from $300–600/mo)" reads as a bill);
// THIS is where the honest per-item ranges live, because next to a checkbox the range is a
// choice, not a charge. Everything derives from the capability registry (single source of
// truth — the same entries the pitch proposes from), filtered to the prospect's vertical, so
// the menu can never offer something the registry can't deliver ('not_built' never appears —
// menuForVertical guarantees it).
//
// Pure: registry data in, strings/numbers out. The impure surface (ClaimBar) only renders.

import { menuForVertical, type Capability } from '../garvis/automation/registry';
import { detectVertical } from '../garvis/verticals';
import { parseMonthlyRange } from '../garvis/clientHuntBuild';

export interface MenuItem {
  id: string;
  title: string;
  pitch: string;          // the registry's one honest line
  priceLabel: string;     // e.g. "$300–600/mo" — shown next to the checkbox
  low: number | null;     // parsed for totalling; null when the label doesn't parse
  high: number | null;
}

/** The menu for one prospect, from the industry string their profile carries (the same
 *  detectVertical the pitch's proposal path uses — menu and email can't disagree about who
 *  this business is). Sorted cheapest-first so the list opens on the easiest yes. */
export function menuForIndustry(industry: string): MenuItem[] {
  const caps = menuForVertical(detectVertical(industry || ''));
  return caps.map(toItem).sort((a, b) => (a.low ?? Infinity) - (b.low ?? Infinity));
}

function toItem(c: Capability): MenuItem {
  const range = parseMonthlyRange(c.monthlyPrice);
  return {
    id: c.id, title: c.title, pitch: c.pitch,
    priceLabel: c.monthlyPrice,
    low: range?.low ?? null, high: range?.high ?? null,
  };
}

/** Sum the picked items into one honest range. Items whose price didn't parse contribute
 *  nothing to the arithmetic but keep their label visible in the UI — the total then reads
 *  as "+" their label rather than silently absorbing an unknown. Empty picks → null. */
export function selectionTotal(items: MenuItem[], pickedIds: string[]): { low: number; high: number } | null {
  const picked = items.filter((i) => pickedIds.includes(i.id) && i.low != null && i.high != null);
  if (!picked.length) return null;
  return {
    low: picked.reduce((s, i) => s + (i.low as number), 0),
    high: picked.reduce((s, i) => s + (i.high as number), 0),
  };
}

/** "$500–900/mo" — the live total under the checkboxes. */
export function totalLabel(total: { low: number; high: number } | null): string {
  if (!total) return '';
  return total.low === total.high ? `$${total.low}/mo` : `$${total.low}–${total.high}/mo`;
}

/** "from $150/mo" — the cheapest entry across the menu (the collapsed bar's honest teaser). */
export function startingAtLabel(items: MenuItem[]): string | null {
  const lows = items.map((i) => i.low).filter((n): n is number => n != null);
  return lows.length ? `from $${Math.min(...lows)}/mo` : null;
}

/** The picks as one plain sentence for the claim message — what the operator reads in the
 *  Claims lane and the lead's message field. Deterministic order (menu order) so two identical
 *  selections always read identically. */
export function picksSummary(items: MenuItem[], pickedIds: string[], note?: string): string {
  const picked = items.filter((i) => pickedIds.includes(i.id));
  const names = picked.map((i) => `${i.title} (${i.priceLabel})`).join(', ');
  const total = totalLabel(selectionTotal(items, pickedIds));
  const head = picked.length
    ? `[Add-on picks] ${names}${total ? ` — est. ${total} total` : ''}`
    : '';
  const tail = (note ?? '').trim();
  return [head, tail].filter(Boolean).join('\n');
}
