// supabase/functions/_shared/lobCore.ts
// Direct mail's pure core (verified by src/lib/garvis/lobVerify.verify.ts) — shared by the
// lob-verify edge function and the farm UI so the cost the operator sees BEFORE clicking is the
// same arithmetic the function enforces. Grows the MailerSpec → Lob HTML compiler in SW10.3.
//
// HONESTY: mapDeliverability only ever returns 'verified' or 'undeliverable' for answers Lob
// actually gave; anything else — an error, an empty response, a deliverability string we don't
// recognize — maps to 'unverified' (we looked and could not tell; never a guess). The unit price
// is a NAMED ESTIMATE (Lob's published US-verification list price); the UI renders it with '≈'
// and the operator can true it up against their own Lob contract.

/** Per-invocation row ceiling — no un-ceilinged third-party spend button (doctrine review). */
export const VERIFY_RUN_CAP = 100;

/** Lob US-verification list price, USD per lookup. An estimate for the preview line, not a bill. */
export const VERIFY_UNIT_USD = 0.025;

/** Gap between Lob calls — polite pacing well under Lob's rate limits. */
export const VERIFY_THROTTLE_MS = 150;

/** The cost the operator sees BEFORE the run: "N lookups × $unit ≈ $X". '' when nothing to do. */
export function verifyCostLine(n: number): string {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return '';
  const capped = Math.min(count, VERIFY_RUN_CAP);
  const est = (capped * VERIFY_UNIT_USD).toFixed(2);
  const capNote = count > VERIFY_RUN_CAP ? ` (first ${VERIFY_RUN_CAP} of ${count.toLocaleString('en-US')} this run)` : '';
  return `${capped.toLocaleString('en-US')} lookup${capped === 1 ? '' : 's'} × $${VERIFY_UNIT_USD} ≈ $${est}${capNote}`;
}

// ---------------------------------------------------------------------------
// The drop side (SW10.3): pricing the staged drop and compiling the approved
// design snapshot into the HTML Lob actually prints.

/** Lob 6×9 postcard list-price ballpark (print + postage), USD per piece. A NAMED ESTIMATE for
 *  the approval ceiling — the operator can override per drop; the executor treats the approved
 *  total as a hard ceiling either way. */
export const LOB_POSTCARD_UNIT_USD = 0.99;

/** The structural slice of MailerSpec the Lob compiler needs (defined here so the shared core
 *  never imports from src/ — client MailerSpec values satisfy it structurally). */
export interface LobPostcardSpec {
  front: { imageUrl: string | null; imageAlt: string; headline: string; kicker: string | null };
  back: {
    headline: string; body: string; offer: string; cta: string;
    contactLine: string; complianceLine: string | null; linkUrl: string | null; qrUrl: string | null;
  };
  accent: string;
  meta: { sizeIn: [number, number]; bleedIn: number; safeIn: number; addressZoneIn: [number, number] };
  /** The client's brand riding the card (stamped from their brand kit at staging; hash-bound
   *  with the rest of the spec). Absent = the neutral house design, unchanged. */
  brand?: LobBrand | null;
}

// ---- BRAND ON MAIL (one brand, many channels): a client's postcards look like THEIR business --

export interface LobBrand {
  businessName?: string | null;
  /** Hex. The authoritative accent when present — brand consistency is the product's promise;
   *  a one-off card color belongs in the kit, not around it. */
  primary?: string | null;
  ink?: string | null;      // hex; must be DARK or it falls back (print legibility)
  paper?: string | null;    // hex; must be LIGHT or it falls back (print + address scannability)
  font?: 'grotesk' | 'humanist' | 'serif' | null;
  logoUrl?: string | null;  // https only
}

/** Print-safe stacks only — a postcard renderer is not a browser with your webfonts. */
export const LOB_FONT_STACKS: Record<'grotesk' | 'humanist' | 'serif', string> = {
  grotesk: "'Helvetica Neue',Helvetica,Arial,sans-serif",
  humanist: "'Trebuchet MS',Verdana,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
};

const HEX_RE = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/;

/** Relative luminance 0..1 of a #rgb/#rrggbb hex (print-contrast gate). */
export function hexLuminance(hex: string): number {
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const validHex = (v: unknown): string | null => (typeof v === 'string' && HEX_RE.test(v) ? v : null);
const darkHex = (v: unknown): string | null => { const h = validHex(v); return h && hexLuminance(h) <= 0.45 ? h : null; };
const lightHex = (v: unknown): string | null => { const h = validHex(v); return h && hexLuminance(h) >= 0.85 ? h : null; };

/** Derive a card brand from a stored brand kit. Junk never survives: colors must be real hex
 *  (ink dark, paper light), the logo https, the font mapped to a print-safe stack. Returns null
 *  when the kit contributes nothing — the neutral house design is the honest fallback. */
export function lobBrandFromKit(kit: {
  name?: string | null; palette?: unknown; fonts?: unknown; logo_url?: string | null;
}): LobBrand | null {
  const hexes = (Array.isArray(kit.palette) ? kit.palette : []).map(validHex).filter((h): h is string => !!h);
  const primary = hexes[0] ?? null;
  // Ink is the first dark hex that ISN'T the primary — headline (primary) and body (ink) must
  // keep their hierarchy; a palette whose only dark IS the primary falls back to neutral ink.
  const ink = hexes.filter((h) => h !== primary).map(darkHex).find((h) => !!h) ?? null;
  const paper = hexes.map(lightHex).find((h) => !!h) ?? null;
  const firstFont = (Array.isArray(kit.fonts) ? kit.fonts : []).find((f) => typeof f === 'string' && f.trim()) as string | undefined;
  const font = !firstFont ? null
    : /serif|georgia|times|playfair|merriweather|garamond|lora|freight/i.test(firstFont) && !/sans/i.test(firstFont) ? 'serif' as const
    : /verdana|trebuchet|tahoma|segoe|open sans|source sans|lato/i.test(firstFont) ? 'humanist' as const
    : 'grotesk' as const;
  const logoUrl = typeof kit.logo_url === 'string' && /^https:\/\//.test(kit.logo_url) ? kit.logo_url : null;
  const businessName = kit.name?.trim() || null;
  if (!primary && !ink && !paper && !font && !logoUrl) return null;
  return { businessName, primary, ink, paper, font, logoUrl };
}

/** Every [EDIT: …] hole still in the spec, verbatim. A card with holes must never print. */
export function specHoles(spec: LobPostcardSpec): string[] {
  const holes: string[] = [];
  const scan = (v: unknown) => {
    if (typeof v !== 'string') return;
    for (const m of v.matchAll(/\[EDIT:[^\]]*\]/g)) holes.push(m[0]);
  };
  scan(spec.front.headline); scan(spec.front.kicker); scan(spec.front.imageAlt);
  scan(spec.back.headline); scan(spec.back.body); scan(spec.back.offer); scan(spec.back.cta);
  scan(spec.back.contactLine); scan(spec.back.complianceLine);
  return holes;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Compile the approved design snapshot into Lob front/back HTML. THROWS while any [EDIT:] hole
 * remains — an unfinished card is a refusal, never a printed placeholder. Honors the mailer
 * studio's print geometry verbatim: the page is size + 2×bleed on each axis, text keeps to the
 * safe zone, and the back's bottom-right address zone stays ink-free for USPS addressing.
 */
export function compileLobHtml(spec: LobPostcardSpec): { front: string; back: string } {
  const holes = specHoles(spec);
  if (holes.length) {
    throw new Error(`The card still has ${holes.length} unfinished edit${holes.length === 1 ? '' : 's'} (${holes.slice(0, 3).join(', ')}${holes.length > 3 ? '…' : ''}) — finish the design before it can print.`);
  }
  const [w, h] = spec.meta.sizeIn; // the studio's convention: [width, height] → [9, 6] postcard
  const bleed = spec.meta.bleedIn;
  const safe = spec.meta.safeIn;
  const [azW, azH] = spec.meta.addressZoneIn;
  const pageW = (w + 2 * bleed).toFixed(3);
  const pageH = (h + 2 * bleed).toFixed(3);
  const pad = (bleed + safe).toFixed(3);
  // Brand-on-mail: the client's kit colors the card; every invalid or missing value falls back
  // to the neutral house design. The brand's primary is authoritative over the per-card accent —
  // brand consistency is the promise; a one-off color belongs in the kit, not around it.
  const b = spec.brand ?? {};
  const brandPrimary = typeof b.primary === 'string' && HEX_RE.test(b.primary) ? b.primary : null;
  const accent = brandPrimary ?? (/^#[0-9a-fA-F]{3,8}$/.test(spec.accent) ? spec.accent : '#1a1a1a');
  const ink = darkHex(b.ink) ?? '#1a1a1a';
  const paper = lightHex(b.paper) ?? '#ffffff';
  const fontStack = b.font && LOB_FONT_STACKS[b.font] ? LOB_FONT_STACKS[b.font] : 'Helvetica,Arial,sans-serif';
  const logo = typeof b.logoUrl === 'string' && /^https:\/\//.test(b.logoUrl)
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="${escapeHtml(b.businessName ?? 'logo')}" style="height:0.32in;display:block;margin-bottom:0.1in">`
    : '';

  const page = (body: string) =>
    `<html><head><meta charset="utf-8"><style>` +
    `*{margin:0;padding:0;box-sizing:border-box}` +
    `body{width:${pageW}in;height:${pageH}in;font-family:${fontStack};color:${ink};background:${paper};position:relative;overflow:hidden}` +
    `</style></head><body>${body}</body></html>`;

  const front = page(
    (spec.front.imageUrl
      ? `<img src="${escapeHtml(spec.front.imageUrl)}" alt="${escapeHtml(spec.front.imageAlt)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
      : `<div style="position:absolute;inset:0;background:${accent}"></div>`) +
    `<div style="position:absolute;left:0;right:0;bottom:0;padding:${pad}in;background:linear-gradient(transparent,rgba(0,0,0,0.65));color:#fff">` +
    (spec.front.kicker ? `<div style="font-size:14pt;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(spec.front.kicker)}</div>` : '') +
    `<div style="font-size:30pt;font-weight:700;line-height:1.15">${escapeHtml(spec.front.headline)}</div>` +
    `</div>`,
  );

  const back = page(
    `<div style="position:absolute;top:0;left:0;bottom:0;width:${(Number(pageW) - azW - safe).toFixed(3)}in;padding:${pad}in">` +
    logo +
    `<div style="font-size:16pt;font-weight:700;color:${accent}">${escapeHtml(spec.back.headline)}</div>` +
    `<div style="font-size:11pt;line-height:1.5;margin-top:0.12in;white-space:pre-line">${escapeHtml(spec.back.body)}</div>` +
    `<div style="font-size:12pt;font-weight:700;margin-top:0.14in">${escapeHtml(spec.back.offer)}</div>` +
    `<div style="font-size:11pt;margin-top:0.1in">${escapeHtml(spec.back.cta)}${spec.back.linkUrl ? ` — ${escapeHtml(spec.back.linkUrl)}` : ''}</div>` +
    `<div style="font-size:9pt;color:#444;margin-top:0.14in">${escapeHtml(spec.back.contactLine)}</div>` +
    (spec.back.complianceLine ? `<div style="font-size:7pt;color:#666;margin-top:0.08in">${escapeHtml(spec.back.complianceLine)}</div>` : '') +
    `</div>` +
    // The USPS address zone (bottom-right) stays ink-free — Lob prints the address + IMb here.
    `<div style="position:absolute;right:0;bottom:0;width:${azW}in;height:${azH}in;background:#ffffff"></div>`,
  );

  return { front, back };
}

// ---------------------------------------------------------------------------
// The tracking side (SW10.4): Lob webhook events map onto the piece lifecycle
// MONOTONICALLY — a piece only ever advances, so replays and out-of-order
// deliveries can never regress 'delivered' back to 'in_transit'.

/** Lifecycle rank. Advancement is strictly upward; 'returned' is terminal-by-exception. */
export const PIECE_RANK: Record<string, number> = { staged: 0, submitted: 1, in_transit: 2, delivered: 3 };

/** How many pieces one lob-send invocation submits before it re-invokes itself to drain the rest. */
export const PIECES_PER_RUN = 25;

/**
 * Map a Lob event type to the piece status it implies. Unknown events map to null (ignored —
 * never a guess). 'processed_for_delivery' is USPS's FINAL scan for postcards (there is no
 * per-mailbox scan), so it is our 'delivered'; the raw event name is preserved in last_event.
 */
export function mapLobEvent(eventTypeId: unknown): 'in_transit' | 'delivered' | 'returned' | null {
  if (typeof eventTypeId !== 'string') return null;
  const e = eventTypeId.toLowerCase();
  if (e === 'postcard.returned_to_sender') return 'returned';
  if (e === 'postcard.processed_for_delivery') return 'delivered';
  if (e === 'postcard.in_transit' || e === 'postcard.in_local_area' || e === 'postcard.re-routed') return 'in_transit';
  return null;
}

/**
 * The monotonic advance: returns the status to write, or null when the event must be ignored
 * (replay, out-of-order, or unknown current state). 'returned' applies from any non-returned
 * state — a came-back piece is a fact regardless of what we believed its progress was.
 */
export function advancePiece(current: string, target: 'in_transit' | 'delivered' | 'returned'): string | null {
  if (current === 'returned') return null;                       // terminal — nothing follows a return
  if (target === 'returned') return 'returned';
  const cur = PIECE_RANK[current];
  const tgt = PIECE_RANK[target];
  if (cur === undefined || tgt === undefined) return null;       // canceled/failed/unknown never advance
  return tgt > cur ? target : null;
}

export interface VerifyMapping {
  status: 'verified' | 'undeliverable' | 'unverified';
  detail: string | null;
}

/**
 * Map Lob's `deliverability` answer to our recipient status. The deliverable_* variants are
 * verified WITH the caveat carried in detail (USPS will deliver, but the unit line has an issue
 * worth seeing); undeliverable is Lob's own verdict; everything else is honestly unverified.
 */
export function mapDeliverability(deliverability: unknown): VerifyMapping {
  if (typeof deliverability !== 'string' || !deliverability) return { status: 'unverified', detail: null };
  const d = deliverability.toLowerCase();
  if (d === 'deliverable') return { status: 'verified', detail: null };
  if (d === 'deliverable_missing_unit' || d === 'deliverable_incorrect_unit' || d === 'deliverable_unnecessary_unit') {
    return { status: 'verified', detail: d.replace(/_/g, ' ') };
  }
  if (d === 'undeliverable') return { status: 'undeliverable', detail: 'USPS data says this address cannot receive mail' };
  return { status: 'unverified', detail: null };
}
