// Run: npx tsx src/lib/garvis/lobDrop.verify.ts
// The drop-staging contract (SW10.3): an unfinished design never compiles or stages, the Lob
// HTML honors the mailer studio's exact print geometry, the ONE approval binds pieces + design +
// cost ceiling under the payload hash, and approving today records a decision — it does not
// pretend to mail.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { specHoles, compileLobHtml, LOB_POSTCARD_UNIT_USD, type LobPostcardSpec } from './lobCore';
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
  check('the card says nothing mails yet — no fake send at approval time',
    run.includes('Nothing mails yet'));
  check('every piece carries a fresh per-household attribution token', run.includes('qr_token: crypto.randomUUID()'));
  check('a failed stage cleans up after itself (pieces cascade with the drop)',
    /catch \(e\) \{\s*await cleanup\(\)/.test(run));
  check('approving advances the drop staged → approved and ledgers the honest skip',
    client.includes("eq('status', 'staged')") && client.includes('nothing has mailed'));
  check('rejecting cancels the staged drop', /send_mail' && inv\.payload\?\.drop_id[\s\S]{0,200}status: 'canceled'/.test(client));
  check('the farm panel stages through the spine', panel.includes('requestMailDrop({'));
  check('the staging tables avoid the app_0035 mail_batches clash',
    mig153.includes('create table if not exists public.mail_drops') && !mig153.includes('create table if not exists public.mail_batches'));
  check('the enum migration is additive, idempotent, and ALONE in its file',
    mig154.includes("add value if not exists 'send_mail'") && !/create\s+table|update\s|insert\s/i.test(mig154));
  check('send_mail has the send-family TTL', /send_mail:\s*7/.test(ttl));
}

console.log(`\nlobDrop.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} lob drop check(s) failed`);
