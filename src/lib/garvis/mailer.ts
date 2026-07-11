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

export type MailerConcept = 'proof' | 'before_after' | 'local_authority';

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
        craft ? `The front of this card is our real work — ${craft}.` : 'The front of this card is our real work.',
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
  }

  const link = (input.linkUrl ?? '').trim() || firstLink(ctx) || null;
  const contactBits = [name, link ? shortUrl(link) : null].filter(Boolean);

  return {
    concept,
    front: {
      imageUrl: input.imageUrl,
      imageAlt: (input.imageAlt ?? '').trim() || (craft ? `${name} — ${craft}` : name),
      headline,
      kicker,
    },
    back: {
      headline: backHeadline,
      body: bodyLines.filter(Boolean).join('\n'),
      offer,
      cta: link ? `Scan the code or visit ${shortUrl(link)}` : EDIT('how to respond: a phone, URL, or "reply to this card"'),
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
