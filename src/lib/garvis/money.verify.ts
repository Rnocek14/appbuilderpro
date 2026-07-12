// src/lib/garvis/money.verify.ts — run: npx tsx src/lib/garvis/money.verify.ts
import { invoiceTotal, chaseStage, invoiceEmail, chaseEmail, type InvoiceLike } from './money';

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) failures++; };

const inv = (over: Partial<InvoiceLike> = {}): InvoiceLike => ({
  number: 'INV-2026-003', title: 'Lakefront listing photography', to_email: 'client@x.com',
  line_items: [{ description: 'Shoot day', qty: 1, unit_usd: 450 }, { description: 'Edited photos', qty: 20, unit_usd: 12.5 }],
  amount_usd: 700, due_date: '2026-07-10', payment_url: null, status: 'sent',
  sent_at: '2026-07-01T00:00:00Z', paid_at: null, last_chase_stage: 0, ...over,
});

check('invoiceTotal sums qty × unit to cents', invoiceTotal(inv().line_items) === 700);
check('invoiceTotal tolerates garbage rows', invoiceTotal([{ description: 'x', qty: NaN, unit_usd: 10 }]) === 0);

// The ladder: fixed dates, deterministic stages.
const at = (d: string) => new Date(`${d}T12:00:00Z`);
check('4+ days before due → no chase', chaseStage(inv(), at('2026-07-05')) === 0);
check('3 days before due → upcoming (1)', chaseStage(inv(), at('2026-07-07')) === 1);
check('due day → due (2)', chaseStage(inv(), at('2026-07-10')) === 2);
check('8 days past → firm (3)', chaseStage(inv(), at('2026-07-18')) === 3);
check('15 days past → final (4)', chaseStage(inv(), at('2026-07-25')) === 4);
check('paid invoices NEVER chase', chaseStage(inv({ paid_at: '2026-07-09T00:00:00Z' }), at('2026-07-25')) === 0);
check('drafts and void invoices never chase', chaseStage(inv({ status: 'draft' }), at('2026-07-25')) === 0 && chaseStage(inv({ status: 'void' }), at('2026-07-25')) === 0);
check('no due date → never chases (no invented urgency)', chaseStage(inv({ due_date: null }), at('2026-07-25')) === 0);

const email = invoiceEmail(inv(), 'Riley');
check('invoice email carries number, total, and every line item', email.subject.includes('INV-2026-003') && email.body.includes('$700.00') && email.body.includes('Shoot day') && email.body.includes('20 × $12.50'));
check('no payment link → honest reply-to-arrange line', email.body.includes('arrange payment'));
check('payment link rides when present', invoiceEmail(inv({ payment_url: 'https://pay.x/y' }), 'R').body.includes('https://pay.x/y'));

const firm = chaseEmail(3, inv(), 'Riley')!;
const final = chaseEmail(4, inv(), 'Riley')!;
check('firm chase is direct but invites dialogue', firm.body.includes('past due') && firm.body.includes('reply and tell me'));
check('final names the pause, never fake collections', final.body.includes('pause any further work') && !/collection|legal action/i.test(final.body));
check('every chase states the real amount + number', [1, 2, 3, 4].every((s) => { const e = chaseEmail(s, inv(), 'R')!; return e.body.includes('INV-2026-003') && e.body.includes('$700.00'); }));
check('stage 0 → no message', chaseEmail(0, inv(), 'R') === null);

if (failures) throw new Error(`${failures} money verify check(s) FAILED`);
console.log('\nAll money checks passed.');
