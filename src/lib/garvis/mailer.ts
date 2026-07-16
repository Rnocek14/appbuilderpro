// src/lib/garvis/mailer.ts
// DIRECT MAIL AS A REAL PRODUCT — pure core (verified by mailer.verify.ts).
// The audit found direct mail dead-ended after copy: concepts existed as text, but nothing could
// become a POSTCARD you'd actually put in a mailbox. This module compiles a print-ready 6×9
// postcard spec from the world's REAL materials — its business context, its brand kit, its vault
// photos — following the industry-standard concept shapes (expertise.ts: full-bleed proof /
// before-after / local authority). Deterministic: same inputs, same card. Honest: every line
// comes from the context or the operator's own edits; unknown facts surface as visible
// EDIT-ME prompts, never invented specifics.
//
// The impure half is the MailerDesigner component (preview, image picking, QR, print CSS,
// save-to-studio, mail log). USPS sizing facts encoded here: a 6×9 postcard prints at
// 6.25in × 9.25in with 0.125in bleed on each edge; keep text inside a 0.25in safe zone; leave
// the bottom-right ~4in × 2.375in of the back clear for the address block + postage.

import type { BusinessContext } from './genesis';

export type MailerConcept = 'proof' | 'before_after' | 'local_authority' | 'question' | 'urgency' | 'offer_first' | 'story';

export interface MailerBrand {
  palette?: string[];          // hex colors, first = primary accent
  fonts?: string[];
  compliance_line?: string | null;
}

export interface MailerInput {
  ctx: BusinessContext;
  brand?: MailerBrand | null;
  concept: MailerConcept;
  imageUrl: string | null;         // the vault photo carrying the front (real artwork, never stock)
  imageAlt?: string | null;
  offer: string;                   // ONE offer per campaign (the 40/40/20 rule) — operator-editable
  linkUrl?: string | null;         // tracking destination; becomes the QR when present
  headline?: string | null;        // operator override for the front headline (e.g. "Just Listed — 123 Maple St")
  phone?: string | null;           // a phone is a valid "how to respond" — completes the card without a link
}

export interface MailerSpec {
  concept: MailerConcept;
  front: {
    imageUrl: string | null;
    imageAlt: string;
    headline: string;              // ≤ 48 chars — front headlines are read at arm's length
    kicker: string | null;         // small line above/below the headline
  };
  back: {
    headline: string;
    body: string;                  // 3-5 short lines
    offer: string;
    cta: string;
    contactLine: string;           // who to reach and how (from ctx/links — never invented)
    complianceLine: string | null;
    linkUrl: string | null;        // the clean printed short line
    qrUrl: string | null;          // linkUrl + ?src=postcard — what the QR actually encodes
  };
  accent: string;                  // brand primary or the house ember
  meta: { sizeIn: [number, number]; bleedIn: number; safeIn: number; addressZoneIn: [number, number] };
}

const EDIT = (what: string) => `[EDIT: ${what}]`;
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

/** Compile the postcard. Every string derives from the inputs; holes are visible EDIT prompts. */
export function compileMailer(input: MailerInput): MailerSpec {
  const { ctx, concept } = input;
  const name = ctx.business_name || EDIT('business name');
  const craft = ctx.craft || '';
  const locale = ctx.locale || '';
  const principal = ctx.principal || '';
  const offer = input.offer.trim() || EDIT('the one offer this campaign makes');

  let headline: string;
  let kicker: string | null;
  let backHeadline: string;
  let bodyLines: string[];

  switch (concept) {
    case 'proof':
      headline = clip(craft ? `Real ${craft}. No stock photos.` : `Made by ${name}.`, 48);
      kicker = locale ? clip(`${name} · ${locale}`, 44) : name;
      backHeadline = craft ? clip(`This is what ${name} makes.`, 60) : `From ${name}.`;
      bodyLines = [
        input.imageUrl
          ? (craft ? `The front of this card is our real work — ${craft}.` : 'The front of this card is our real work.')
          : (craft ? `Real ${craft}, made locally — no stock photos, no call center.` : EDIT('one honest trust line — what makes you real')),
        ctx.audience ? `We make it for ${ctx.audience}.` : EDIT('one line: who this is for'),
        offer,
      ];
      break;
    case 'before_after':
      headline = clip('From this… to this.', 48);
      kicker = name;
      backHeadline = clip(`What changed? ${name}.`, 60);
      bodyLines = [
        EDIT('two lines: the before, and what your work turned it into'),
        offer,
      ];
      break;
    case 'local_authority':
      headline = locale ? clip(`${locale}'s own.`, 48) : clip(`Your neighbor, ${name}.`, 48);
      kicker = principal ? clip(`${principal} · ${name}`, 44) : name;
      backHeadline = locale ? clip(`Made here in ${locale}.`, 60) : `Made near you.`;
      bodyLines = [
        principal
          ? `${principal} works right here${locale ? ` in ${locale}` : ''} — not a franchise, not a call center.`
          : EDIT('one line: the local human behind the work'),
        ctx.offerings.length ? `What we do: ${clip(ctx.offerings.slice(0, 3).join(', '), 90)}.` : EDIT('what you offer, plainly'),
        offer,
      ];
      break;
    // Renditions 4–7 — the same REAL materials reframed through different persuasion mechanisms
    // (question, deadline, offer-led, narrative). Deterministic, instant, print-safe; anything
    // the record can't supply is a visible EDIT hole, never an invented claim.
    case 'question':
      headline = ctx.audience ? clip(`Still ${craft ? `settling for less ${craft}` : 'waiting'}?`, 48) : clip(`What would you change first?`, 48);
      kicker = locale ? clip(`${name} · ${locale}`, 44) : name;
      backHeadline = clip(`A fair question — and our answer.`, 60);
      bodyLines = [
        ctx.audience ? `If you're ${clip(ctx.audience, 70)}, you've probably wondered about this.` : EDIT('one line: the question your audience is already asking'),
        craft ? (input.imageUrl ? `${name} does ${craft} — the front of this card is our real work.` : `${name} does ${craft}, right here.`) : EDIT('one line: what you do, plainly'),
        offer,
      ];
      break;
    case 'urgency':
      headline = clip(`This season, not next.`, 48);
      kicker = name;
      backHeadline = clip(`Why now beats later.`, 60);
      bodyLines = [
        EDIT('one honest reason timing matters (season, capacity, a real date — never a fake countdown)'),
        craft ? `${name} — ${craft}${locale ? `, here in ${locale}` : ''}.` : `From ${name}.`,
        offer,
      ];
      break;
    case 'offer_first':
      headline = clip(offer.startsWith('[EDIT') ? EDIT('the offer, big: it IS the headline') : offer, 48);
      kicker = locale ? clip(`${name} · ${locale}`, 44) : name;
      backHeadline = clip(`The fine print (there isn't much).`, 60);
      bodyLines = [
        EDIT('one line: what the offer includes and how long it stands'),
        ctx.audience ? `For ${clip(ctx.audience, 70)}.` : EDIT('who it’s for'),
        input.imageUrl
          ? (craft ? `The photo on the front is our real ${craft}.` : 'The photo on the front is our real work.')
          : (craft ? `Real ${craft}, made locally.` : EDIT('one honest trust line')),
      ];
      break;
    case 'story':
      headline = principal ? clip(`${principal.split(/\s+/)[0]} started this for a reason.`, 48) : clip(`There's a story behind this card.`, 48);
      kicker = name;
      backHeadline = clip(`The short version:`, 60);
      bodyLines = [
        EDIT('two lines: the founding story — why this business exists, in plain words'),
        ctx.audience ? `Today we do it for ${clip(ctx.audience, 60)}.` : '',
        offer,
      ];
      break;
  }

  const link = (input.linkUrl ?? '').trim() || firstLink(ctx) || null;
  const phone = (input.phone ?? '').trim();
  const contactBits = [name, phone || null, link ? shortUrl(link) : null].filter(Boolean);

  // Operator override wins over the concept's auto headline — this is what lets a listing card say
  // exactly "Just Listed — 123 Maple St, $450,000" instead of the generic concept line.
  const frontHeadline = (input.headline ?? '').trim() ? clip((input.headline as string).trim(), 48) : headline;

  return {
    concept,
    front: {
      imageUrl: input.imageUrl,
      imageAlt: (input.imageAlt ?? '').trim() || (craft ? `${name} — ${craft}` : name),
      headline: frontHeadline,
      kicker,
    },
    back: {
      headline: backHeadline,
      body: bodyLines.filter(Boolean).join('\n'),
      offer,
      cta: link ? `Scan the code or visit ${shortUrl(link)}` : phone ? `Call ${phone}` : EDIT('how to respond: a phone, URL, or "reply to this card"'),
      contactLine: contactBits.join(' · '),
      complianceLine: input.brand?.compliance_line?.trim() || null,
      linkUrl: link,
      // The QR encodes ?src=postcard so scans are ATTRIBUTABLE: the generated site's visit ping
      // passes src through to site_events, and the ledger can honestly credit the card.
      qrUrl: link ? withSource(link, 'postcard') : null,
    },
    accent: input.brand?.palette?.[0] || '#FF8A3D',
    meta: { sizeIn: [9, 6], bleedIn: 0.125, safeIn: 0.25, addressZoneIn: [4, 2.375] },
  };
}

function firstLink(ctx: BusinessContext): string | null {
  const vals = Object.values(ctx.links ?? {}).filter((v) => typeof v === 'string' && v.trim());
  return vals[0]?.trim() || null;
}

function shortUrl(u: string): string {
  return u.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 40);
}

/** Append ?src=<source> for attribution without clobbering existing params. Pure. */
function withSource(u: string, source: string): string {
  if (/[?&]src=/.test(u)) return u;
  return `${u}${u.includes('?') ? '&' : '?'}src=${source}`;
}

// ---------------------------------------------------------------------------
// Persistence — the design round-trips through a studio artifact
// ---------------------------------------------------------------------------

const SPEC_MARK = '⟦mailer-spec⟧';

/** Serialize: human-readable copy first (the artifact reads like a document), the machine spec
 *  in a marked JSON footer so the designer can reload exactly what was saved. */
export function mailerToDetail(spec: MailerSpec): string {
  const human = [
    `POSTCARD (6×9, ${spec.concept.replace('_', '-')})`,
    '',
    `FRONT — headline: ${spec.front.headline}`,
    spec.front.kicker ? `        kicker: ${spec.front.kicker}` : null,
    `        image: ${spec.front.imageUrl ?? '(none chosen yet)'}`,
    '',
    `BACK — ${spec.back.headline}`,
    spec.back.body,
    '',
    `CTA: ${spec.back.cta}`,
    `Contact: ${spec.back.contactLine}`,
    spec.back.complianceLine ? `Compliance: ${spec.back.complianceLine}` : null,
    '',
    'Print spec: 6.25×9.25in with bleed, text inside the 0.25in safe zone, bottom-right of the',
    'back kept clear for address + postage. Print at home to PDF or upload to any print vendor.',
  ].filter((l): l is string => l !== null).join('\n');
  return `${human}\n\n${SPEC_MARK}${JSON.stringify(spec)}`;
}

/** Reload a saved design. Tolerant: no marker / bad JSON → null (the designer starts fresh). */
export function parseMailerDetail(detail: string | null | undefined): MailerSpec | null {
  if (!detail) return null;
  const ix = detail.lastIndexOf(SPEC_MARK);
  if (ix === -1) return null;
  try {
    const spec = JSON.parse(detail.slice(ix + SPEC_MARK.length)) as MailerSpec;
    if (!spec?.front || !spec?.back || !spec?.concept) return null;
    return spec;
  } catch {
    return null;
  }
}
