// src/content/studio.verify.ts — the studio site's honesty rails, enforced.
// The public page is outbound copy with a URL: it gets the same discipline as the cold email.
// Run: npx tsx src/content/studio.verify.ts

import { STUDIO, HOW_IT_WORKS, CANDOR, MENU_INDUSTRIES } from './studio';
import { claimViolations } from '../lib/garvis/prospects/pitchFindings';
import { menuForIndustry } from '../lib/preview/automationMenu';
import { CAPABILITIES } from '../lib/garvis/automation/registry';
import { tierById } from '../lib/garvis/billing/clientTiers';

let passed = 0;
function check(name: string, cond: boolean) {
  if (!cond) { console.error(`✗ ${name}`); process.exit(1); }
  passed++; console.log(`✓ ${name}`);
}

const ALL_COPY = [
  STUDIO.tagline,
  ...HOW_IT_WORKS.flatMap((s) => [s.title, s.body]),
  CANDOR.heading, ...CANDOR.lines,
];

// ── the claims gate — same one the cold email passes ───────────────────────
for (const text of ALL_COPY) {
  const v = claimViolations(text);
  check(`claims-gated: "${text.slice(0, 44)}…" ${v.length ? `→ ${v[0].phrase}` : ''}`, v.length === 0);
}

// ── no testimonial theater — the candor block DISAVOWS social proof, so the ban targets the
// markers of actually PERFORMING it (star glyphs, attribution lines, trust walls), not words
// that only appear inside the disavowal itself. ──
const joined = ALL_COPY.join(' ').toLowerCase();
check('no fake social proof performed (stars, "clients say", trusted-by, ratings)',
  !/★|⭐|clients say|trusted by|rated 5|— \w+, (owner|ceo|founder)/.test(joined));
check('the candor block admits the studio is new', CANDOR.lines.some((l) => /new studio/i.test(l)));

// ── the instant-reply promise is opt-in, and structurally impossible without the rail ──
check('instant-reply promise cannot be live without a wired form',
  !STUDIO.instantReplyLive || !!STUDIO.formChannelToken);

// ── identity sanity — the page renders from this, so it must be shaped right ──
check('email is a plausible address', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(STUDIO.email));
check('name and city are set', STUDIO.name.trim().length > 1 && STUDIO.city.trim().length > 1);

// ── pricing renders from the product's sources of truth ────────────────────
check('website tier exists with a price hint', !!tierById('website')?.priceHint);
for (const ind of MENU_INDUSTRIES) {
  const menu = menuForIndustry(ind === 'Other' ? '' : ind);
  check(`menu for "${ind}" is non-empty and deliverable-only`,
    menu.length >= 1 && menu.every((i) => CAPABILITIES.find((c) => c.id === i.id)?.status !== 'not_built'));
}

console.log(`\nstudio.verify: all ${passed} checks passed`);
