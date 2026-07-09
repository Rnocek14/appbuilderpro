// src/lib/garvis/websiteBrief.ts
// G3 — the website bridge, pure core (verified by websiteBrief.verify.ts).
// Compiles ONE structured brief from everything the world knows — DNA, business context, brand
// kit, and the CAPTIONED PHOTOS from its clusters — so the app builder's first generation uses
// the actual artwork, the world's own voice, and a cinematic motion direction. Honesty rules:
// only real uploaded images (never stock), unknown facts omitted (never invented), the lead form
// STORES inquiries and never sends anything (sending stays behind the approval spine).

import type { WorldDNA, BusinessContext } from './genesis';

export interface WebsitePhoto { name: string; url: string; caption: string | null; label: string | null }

export interface BrandKitIn {
  name?: string | null;
  palette?: string[] | null;
  fonts?: string[] | null;
  tone?: string | null;
  logo_url?: string | null;
  compliance_line?: string | null;
}

export interface WebsiteBriefInput {
  worldTitle: string;
  objective: string | null;
  dna: WorldDNA | null;
  ctx: BusinessContext | null;
  brand: BrandKitIn | null;
  photos: WebsitePhoto[];
}

export interface WebsiteBrief { prompt: string; brief: string; heroCandidates: WebsitePhoto[] }

const line = (label: string, v: string | null | undefined): string | null => (v ? `${label}: ${v}` : null);

export function compileWebsiteBrief(input: WebsiteBriefInput, budget = 9000): WebsiteBrief {
  const name = input.ctx?.business_name ?? input.worldTitle;
  const craft = input.ctx?.craft ?? input.dna?.businessType ?? null;
  const prompt = `A cinematic, motion-rich portfolio website for ${name}${craft ? ` — ${craft}` : ''}. Image-first, gallery-led, with a commission inquiry form.`;

  // Hero candidates: photos routed to the website, first three — the builder leads with these.
  const website = input.photos.filter((p) => p.label === 'website');
  const pool = website.length ? website : input.photos;
  const heroCandidates = pool.slice(0, 3);

  const sections: string[] = [];

  const dnaLines = [
    line('Business', input.dna?.businessType ?? null),
    line('Objective', input.objective),
    line('Value proposition', input.dna?.valueProposition ?? null),
    line('Ideal customers', input.dna?.idealCustomers?.length ? input.dna.idealCustomers.join(', ') : null),
    line('Sales cycle', input.dna?.salesCycle ?? null),
    line('Personality', input.dna?.brandPersonality ?? null),
  ].filter(Boolean) as string[];
  if (dnaLines.length) sections.push(['WORLD DNA (design for THIS business):', ...dnaLines].join('\n'));

  const brandLines = [
    line('Voice', input.brand?.tone ?? input.ctx?.tone ?? null),
    input.brand?.palette?.length ? `Palette: ${input.brand.palette.join(', ')}` : null,
    input.brand?.fonts?.length ? `Fonts: ${input.brand.fonts.join(', ')}` : null,
    line('Logo', input.brand?.logo_url ?? null),
    line('Compliance line (footer)', input.brand?.compliance_line ?? null),
  ].filter(Boolean) as string[];
  if (brandLines.length) sections.push(['BRAND:', ...brandLines].join('\n'));

  sections.push([
    'MOTION DIRECTION (the kits ship in every generated app — use them):',
    '- SmoothScroll for the whole page; the site should feel like walking a gallery.',
    '- ScrollScenes image reveals for the portfolio: full-bleed pieces that cross-fade as you scroll.',
    '- TextReveal for the artist statement and section headings.',
    '- Generous whitespace, image-first layout, restrained type. Mobile-first.',
  ].join('\n'));

  const offerings = input.ctx?.offerings?.length ? input.ctx.offerings.join(', ') : null;
  sections.push([
    'PAGES/SECTIONS:',
    '- Home: hero from the HERO CANDIDATES below, one-line positioning, gallery preview.',
    '- Portfolio/Gallery: all provided images, filterable, caption-aware.',
    `- Story: the ${input.ctx?.principal ?? 'maker'}'s story and process.`,
    offerings ? `- Services/Commissions: ${offerings} — with a clear commission CTA.` : '- Services/Commissions: with a clear commission CTA.',
    '- Contact/Inquiry: the lead form (below).',
  ].join('\n'));

  sections.push([
    'LEAD FORM (inquiry):',
    '- Fields: name, email, project type, space/location, budget range (optional), message.',
    '- STORE submissions in the app\'s backend and show a warm confirmation. The form must NOT',
    '  send email or contact anyone — outbound stays behind the owner\'s approval queue.',
  ].join('\n'));

  if (input.photos.length) {
    const imgs = input.photos.slice(0, 40).map((p) => `- ${p.name}: ${p.url}${p.caption ? ` (alt: ${p.caption.slice(0, 140)})` : ''}`);
    sections.push([
      `THE ARTWORK — the user's OWN images (public URLs, already hosted). Use ONLY these images;`,
      'no stock, no placeholders. Write real alt text from the captions:',
      `HERO CANDIDATES: ${heroCandidates.map((p) => p.name).join(', ') || '(none labeled — pick the strongest)'}`,
      ...imgs,
    ].join('\n'));
  } else {
    sections.push('IMAGES: none uploaded yet — build the structure with clearly-marked image slots and NO stock photos; the artwork arrives via the asset library.');
  }

  let brief = sections.join('\n\n');
  if (brief.length > budget) brief = brief.slice(0, budget - 1) + '…';
  return { prompt, brief, heroCandidates };
}
