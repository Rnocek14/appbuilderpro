// src/lib/garvis/mlsToCampaign.ts
// THE MLS → COMPOSER SEAM — pure core (verified by mlsToCampaign.verify.ts). The audit's named
// DISCONNECTED gap: mls_listings holds price/beds/baths the operator retypes into the campaign
// composer by hand. This module turns a synced row into composer fill — every value a string the
// FEED said, formatted but never invented: a missing price stays '', so the composer's honest
// warning + [EDIT] hole machinery takes over exactly as if the operator left the field blank.
// The impure half is the DetailsSheet picker (reads rows client-side under RLS).

import type { MlsRow } from './mlsStats';
import type { CampaignType } from './campaignCore';

/** The composer fields a listing can fill. All strings — the composer's contract is "the
 *  operator's string, never math," and the fill honors it ('' = the feed didn't say). */
export interface CampaignFill {
  address: string;
  price: string;
  area: string;
  beds: string;
  baths: string;
}

/** "$1,150,000" from a feed numeric; null/absurd → '' (a hole, never a guess). */
export function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** A feed numeric as the composer string: 4 → "4", 2.5 → "2.5", null → "". */
function numStr(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '' : String(n);
}

/** RESO UnparsedAddress often carries ", City, ST 12345" — the chip label wants the street. */
export function streetOf(address1: string): string {
  return address1.split(',')[0].trim();
}

/** Map one synced listing into composer fill. Sold campaigns prefer the CLOSE price (what it
 *  actually sold for); everything else quotes the list price. */
export function listingFill(row: MlsRow, type: CampaignType): CampaignFill {
  const price = type === 'just_sold' ? (row.close_price ?? row.list_price) : row.list_price;
  return {
    address: row.address1.trim(),
    price: fmtPrice(price),
    area: row.city.trim(),
    beds: numStr(row.beds),
    baths: numStr(row.baths),
  };
}

const isActive = (s: string) => s.trim().toLowerCase() === 'active';
const isClosed = (s: string) => {
  const v = s.trim().toLowerCase();
  return v === 'closed' || v === 'sold';
};

const DAY = 86_400_000;

/** Which listings make sense to offer for a campaign type — Active for launch/open-house cards,
 *  the last 12 months of closes for sold cards, nothing for campaigns that aren't about one
 *  property. Sorted newest-first by the date that matters; capped so the picker stays a row of
 *  chips, not a table. Pure (reference date injected). */
export function listingChoices(rows: MlsRow[], type: CampaignType, nowIso: string, cap = 12): MlsRow[] {
  const now = new Date(nowIso).getTime();
  const t = (d: string | null) => (d ? new Date(d).getTime() : 0);
  let picked: MlsRow[];
  if (type === 'just_listed' || type === 'open_house') {
    picked = rows.filter((r) => isActive(r.status))
      .sort((a, b) => t(b.list_date) - t(a.list_date));
  } else if (type === 'just_sold') {
    picked = rows.filter((r) => isClosed(r.status) && r.close_date
      && t(r.close_date) >= now - 365 * DAY && t(r.close_date) <= now)
      .sort((a, b) => t(b.close_date) - t(a.close_date));
  } else {
    return [];
  }
  return picked.slice(0, Math.max(0, cap));
}

/** The picker chip text: "123 Shore Dr · $1,150,000" (street + the price this campaign type
 *  would quote; a priceless listing shows street alone — honest, not "$0"). */
export function choiceLabel(row: MlsRow, type: CampaignType): string {
  const street = streetOf(row.address1) || row.address1.trim() || row.listing_key;
  const price = listingFill(row, type).price;
  return price ? `${street} · ${price}` : street;
}
