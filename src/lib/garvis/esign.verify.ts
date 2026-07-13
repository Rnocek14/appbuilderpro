// src/lib/garvis/esign.verify.ts — proof the paperwork/e-sign core keeps its promises.
// Run: npx tsx src/lib/garvis/esign.verify.ts

import {
  templateTokens, mergePaperwork, decideSendable, chunkedBase64,
  docHtml, envelopeRequest, mapDocusignStatus, mapRecipientStatus,
} from '../../../supabase/functions/_shared/esignCore';

let passed = 0; let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
}

// --- tokens + merge honesty ---------------------------------------------------
const tpl = 'Dear {{client_name}},\n\nThis agreement covers {{property_address}} at a fee of {{fee}}.\n\n— {{client_name}}';
check('tokens listed once each, in order', JSON.stringify(templateTokens(tpl)) === '["client_name","property_address","fee"]');
const m1 = mergePaperwork(tpl, { client_name: 'Jane Roe', property_address: '10 Shore Dr', fee: '' });
check('filled fields merge', m1.body.includes('Dear Jane Roe') && m1.body.includes('10 Shore Dr'));
check('empty field is a VISIBLE hole, never invented', m1.body.includes('[needs your input: fee]'));
check('gaps name exactly the unfilled fields', JSON.stringify(m1.gaps) === '["fee"]');
const m2 = mergePaperwork(tpl, { client_name: 'Jane Roe', property_address: '10 Shore Dr', fee: '2.5%' });
check('fully-filled merge has no gaps', m2.gaps.length === 0 && !m2.body.includes('[needs your input'));
check('whitespace-only value counts as a gap', mergePaperwork('{{x}}', { x: '   ' }).gaps.length === 1);

// --- sendable refusal ------------------------------------------------------------
const signer = { name: 'Jane Roe', email: 'jane@x.com' };
check('gaps refuse to send, naming the fields', (() => {
  const d = decideSendable(m1, [signer]);
  return !d.ok && (d.reason ?? '').includes('fee');
})());
check('no signers refuses', !decideSendable(m2, []).ok);
check('invalid signer email refuses by name', (() => {
  const d = decideSendable(m2, [{ name: 'Bo', email: 'not-email' }]);
  return !d.ok && (d.reason ?? '').includes('Bo');
})());
check('clean doc + valid signer sends', decideSendable(m2, [signer]).ok);

// --- chunked base64 ---------------------------------------------------------------
const small = new TextEncoder().encode('hello world');
check('chunked base64 matches btoa on small input', chunkedBase64(small) === btoa('hello world'));
const big = new Uint8Array(3 * 1024 * 1024);
for (let i = 0; i < big.length; i++) big[i] = i % 251;
let bigOk = true;
try {
  const b64 = chunkedBase64(big);
  const round = atob(b64);
  bigOk = round.length === big.length && round.charCodeAt(1_000_000) === big[1_000_000];
} catch { bigOk = false; }
check('3MB encodes without throwing and round-trips (the lakegen crash class)', bigOk);

// --- doc html ----------------------------------------------------------------------
const html = docHtml({ title: 'Listing <Agreement>', body: 'Line one <script>alert(1)</script>\n\nLine two', signers: [signer, { name: 'Co', email: 'co@x.com' }] });
check('body HTML is escaped (no injection into the signed doc)', !html.includes('<script>') && html.includes('&lt;script&gt;'));
check('title escaped too', html.includes('Listing &lt;Agreement&gt;'));
check('one anchor pair per signer', html.includes('/sig1/') && html.includes('/date1/') && html.includes('/sig2/') && html.includes('/date2/'));
check('no invented identity: fromLine absent unless given', !html.includes('Lake Geneva Properties'));

// --- envelope request ----------------------------------------------------------------
const req = envelopeRequest({ title: 'T'.repeat(200), docBase64: 'QQ==', signers: [signer, { name: 'Co', email: 'co@x.com' }], webhookUrl: 'https://x/functions/v1/docusign-webhook' }) as {
  emailSubject: string; documents: { fileExtension: string }[]; status: string;
  recipients: { signers: { recipientId: string; tabs: { signHereTabs: { anchorString: string }[] } }[] };
  eventNotification?: { url: string; envelopeEvents: unknown[] };
};
check('subject clipped to 100', req.emailSubject.length <= 100);
check('html document, status sent', req.documents[0].fileExtension === 'html' && req.status === 'sent');
check('per-signer anchors match the doc', req.recipients.signers[1].tabs.signHereTabs[0].anchorString === '/sig2/');
check('webhook registered per-envelope when given', req.eventNotification?.url.includes('docusign-webhook') === true && (req.eventNotification?.envelopeEvents.length ?? 0) === 5);
check('no webhook → no eventNotification', !('eventNotification' in envelopeRequest({ title: 't', docBase64: 'QQ==', signers: [signer] })));

// --- status maps: unknown is unknown ---------------------------------------------------
check('envelope statuses map', mapDocusignStatus('envelope-completed') === 'completed' && mapDocusignStatus('Sent') === 'sent' && mapDocusignStatus('voided') === 'voided');
check('unknown envelope status → null, never guessed', mapDocusignStatus('processing') === null);
check('recipient statuses map', mapRecipientStatus('completed') === 'signed' && mapRecipientStatus('delivered') === 'delivered');
check('unknown recipient status → null', mapRecipientStatus('autoresponded') === null);

console.log(`\nesign.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) { throw new Error(`${failed} check(s) failed`); }
