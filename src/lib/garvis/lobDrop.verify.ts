// Run: npx tsx src/lib/garvis/lobDrop.verify.ts
// The drop-staging contract (SW10.3): an unfinished design never compiles or stages, the Lob
// HTML honors the mailer studio's exact print geometry, the ONE approval binds pieces + design +
// cost ceiling under the payload hash, and approving today records a decision — it does not
// pretend to mail.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  specHoles, compileLobHtml, LOB_POSTCARD_UNIT_USD, lobBrandFromKit, hexLuminance, type LobPostcardSpec,
} from './lobCore';
import { suppressionBreakdown } from './lobRun';
import { farmMath } from './farm';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const spec = (over?: Partial<LobPostcardSpec['back']>): LobPostcardSpec => ({
  front: { imageUrl: null, imageAlt: 'The maple-lined entry to Maple Grove', headline: 'Your neighbor just sold in 9 days', kicker: 'Maple Grove' },
  back: {
    headline: 'What did it sell for?', body: 'Three homes on your street changed hands this spring.\nThe market moved — your number did too.',
    offer: 'A free, no-pressure price update for your exact home', cta: 'Text HOME to get yours',
    contactLine: 'Jane Doe · (262) 555-0148', complianceLine: null,
    linkUrl: 'https://example.com/mg', qrUrl: 'https://example.com/mg?src=postcard',
    ...over,
  },
  accent: '#B3402E',
  meta: { sizeIn: [9, 6], bleedIn: 0.125, safeIn: 0.25, addressZoneIn: [4, 2.375] },
});

// ---- unfinished designs are refusals, never prints ----
check('specHoles finds every [EDIT:] hole verbatim',
  (() => { const h = specHoles(spec({ offer: '[EDIT: your offer]', cta: 'Call [EDIT: phone]' })); return h.length === 2 && h[0] === '[EDIT: your offer]'; })());
check('a finished design has no holes', specHoles(spec()).length === 0);
check('compileLobHtml THROWS while holes remain, naming them',
  (() => { try { compileLobHtml(spec({ offer: '[EDIT: your offer]' })); return false; } catch (e) { return e instanceof Error && e.message.includes('[EDIT: your offer]'); } })());

// ---- the geometry is the studio's, not a second opinion ----
{
  const { front, back } = compileLobHtml(spec());
  check('the page is size + bleed on both axes (9.25 × 6.25in)',
    front.includes('width:9.250in') && front.includes('height:6.250in'));
  check('text keeps to the safe zone (bleed + safe padding)', front.includes('padding:0.375in') && back.includes('padding:0.375in'));
  check('the back reserves the USPS address zone ink-free (4 × 2.375in, bottom-right)',
    back.includes('width:4in') && back.includes('height:2.375in') && back.includes('right:0;bottom:0'));
  check('copy is HTML-escaped on the way in',
    compileLobHtml(spec({ headline: 'A <b>bold</b> & "quoted" claim' })).back.includes('A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; claim'));
  check('no [EDIT: text survives into compiled HTML', !front.includes('[EDIT:') && !back.includes('[EDIT:'));
}
{
  const mailer = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mailer.ts'), 'utf8');
  check('the fixture geometry IS the studio geometry (one truth, pinned)',
    mailer.includes('sizeIn: [9, 6], bleedIn: 0.125, safeIn: 0.25, addressZoneIn: [4, 2.375]'));
}

// ---- pricing and the breakdown ----
check('the estimate is the real farm arithmetic (one drop of exactly these pieces)',
  farmMath({ homes: 100, pieceCostUsd: LOB_POSTCARD_UNIT_USD, dropsPerYear: 1, soldLast12: null }).perDropUsd === 99);
check('the suppression breakdown groups by reason family',
  (() => {
    const b = suppressionBreakdown([
      { recipient: null as never, reason: 'do-not-mail' },
      { recipient: null as never, reason: 'undeliverable (USPS verification or a returned piece)' },
      { recipient: null as never, reason: 'incomplete address (needs street, city, state, ZIP)' },
      { recipient: null as never, reason: 'do-not-mail' },
    ]);
    return b.do_not_mail === 2 && b.undeliverable === 1 && b.incomplete_address === 1;
  })());

// ---- wiring pins ----
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const run = readFileSync(join(here, 'lobRun.ts'), 'utf8');
const client = readFileSync(join(here, 'execution.ts'), 'utf8');
const panel = readFileSync(join(root, 'src/components/garvis/FarmPanel.tsx'), 'utf8');
const mig153 = readFileSync(join(root, 'supabase/migrations/app_0153_lob_mail.sql'), 'utf8');
const mig154 = readFileSync(join(root, 'supabase/migrations/app_0154_send_mail_enum.sql'), 'utf8');
const ttl = readFileSync(join(root, 'supabase/functions/_shared/approvalTtl.ts'), 'utf8');
{
  check('staging refuses an unfinished design before any row is written',
    /const holes = specHoles\(input\.spec\);[\s\S]{0,300}throw new Error/.test(run));
  check('ONE approval binds the drop, the design hash, the addressed-list hash, and the ceiling',
    run.includes("kind: 'send_mail'") && run.includes('pieces_hash: piecesHash')
    && run.includes('spec_hash: specHash') && run.includes('est_total_usd: estTotalUsd'));
  check('the card prices the drop and names the ceiling and the suppression breakdown',
    run.includes('the hard ceiling') && run.includes('held back'));
  check('the card says approval executes through the one mail path with gates re-checked',
    run.includes('every gate re-checked at send time'));
  check('every piece carries a fresh per-household attribution token', run.includes('qr_token: crypto.randomUUID()'));
  check('a failed stage cleans up after itself (pieces cascade with the drop)',
    /catch \(e\) \{\s*await cleanup\(\)/.test(run));
  check('approving advances the drop staged → approved and executes through lob-send',
    client.includes("eq('status', 'staged')")
    && /send_mail'\)\s*\{[\s\S]{0,900}functions\.invoke\('lob-send', \{ body: \{ approval_id: a\.id \} \}\)/.test(client));
  check('a soft failure returns the row to pending — retryable, never stranded',
    /send_mail'\)\s*\{[\s\S]{0,1600}revertToPending\(a\.id\)/.test(client));
  check('rejecting cancels the staged drop', /send_mail' && inv\.payload\?\.drop_id[\s\S]{0,200}status: 'canceled'/.test(client));
  check('the farm panel stages through the spine', panel.includes('requestMailDrop({'));
  check('the staging tables avoid the app_0035 mail_batches clash',
    mig153.includes('create table if not exists public.mail_drops') && !mig153.includes('create table if not exists public.mail_batches'));
  check('the enum migration is additive, idempotent, and ALONE in its file',
    mig154.includes("add value if not exists 'send_mail'") && !/create\s+table|update\s|insert\s/i.test(mig154));
  check('send_mail has the send-family TTL', /send_mail:\s*7/.test(ttl));
}

// ---- BRAND ON MAIL: a client's card looks like THEIR business — safely ----
{
  const kit = { name: 'Maple Grove Realty', palette: ['#7A1F2B', '#2B1A1A', '#FBF7F2', 'salmon'], fonts: ['Georgia'], logo_url: 'https://cdn.example.com/mg.png' };
  const brand = lobBrandFromKit(kit)!;
  check('the kit derives a full brand: primary, dark ink, light paper, serif, https logo',
    brand.primary === '#7A1F2B' && brand.ink === '#2B1A1A' && brand.paper === '#FBF7F2'
    && brand.font === 'serif' && brand.logoUrl === 'https://cdn.example.com/mg.png'
    && brand.businessName === 'Maple Grove Realty');
  check('junk never survives: non-hex colors and non-https logos are dropped',
    (() => { const b = lobBrandFromKit({ palette: ['salmon', 'rgb(1,2,3)'], logo_url: 'http://x.com/l.png' }); return b === null; })());
  check('a contributing-nothing kit is null — the neutral house design is the fallback',
    lobBrandFromKit({ name: '' }) === null);
  check('luminance gates hold: a dark-only palette becomes the primary, never paper or ink',
    (() => { const b = lobBrandFromKit({ palette: ['#111111'] })!; return b.paper === null && b.ink === null && b.primary === '#111111'; })());
  check('hexLuminance reads white light and black dark',
    hexLuminance('#ffffff') > 0.99 && hexLuminance('#000000') < 0.01);

  const branded = { ...spec(), brand };
  const { front, back } = compileLobHtml(branded);
  check('the branded card carries the kit: serif stack, brand ink, brand paper',
    back.includes("Georgia,'Times New Roman',serif") && back.includes('color:#2B1A1A') && back.includes('background:#FBF7F2'));
  check('the brand primary is authoritative over the per-card accent (consistency is the promise)',
    back.includes('color:#7A1F2B') && !back.includes('color:#B3402E'));
  check('the logo prints on the back, sized for print, named for the business',
    back.includes('https://cdn.example.com/mg.png') && back.includes('height:0.32in') && back.includes('alt="Maple Grove Realty"'));
  check('the USPS address zone stays white REGARDLESS of brand paper',
    back.includes('background:#ffffff'));
  check('the front headline band still reads on any brand (its own overlay, unbranded)',
    front.includes('rgba(0,0,0,0.65)'));

  const plain = compileLobHtml(spec());
  check('no brand = the neutral house design, exactly as before',
    plain.back.includes('Helvetica,Arial,sans-serif') && plain.back.includes('color:#1a1a1a')
    && plain.back.includes('background:#ffffff') && plain.back.includes('color:#B3402E'));
}
{
  const run = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lobRun.ts'), 'utf8');
  check('staging stamps the brand BEFORE the spec is snapshotted and hashed (approved = printed)',
    run.indexOf('lobBrandFromKit(kitRow)') < run.indexOf("from('mail_drops').insert")
    && run.indexOf('lobBrandFromKit(kitRow)') < run.indexOf('hashPayload(spec'));
  check('a kit-load hiccup never blocks a drop', run.includes('.then((r) => r.data, () => null)'));
}

console.log(`\nlobDrop.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} lob drop check(s) failed`);
