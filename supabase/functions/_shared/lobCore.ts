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
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(spec.accent) ? spec.accent : '#1a1a1a';

  const page = (body: string) =>
    `<html><head><meta charset="utf-8"><style>` +
    `*{margin:0;padding:0;box-sizing:border-box}` +
    `body{width:${pageW}in;height:${pageH}in;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;background:#ffffff;position:relative;overflow:hidden}` +
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
