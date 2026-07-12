// Run: npx tsx src/lib/garvis/contacts.verify.ts
import { mergeTimeline } from './contactsCore';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('contacts.verify');

{
  const t = mergeTimeline({
    messages: [
      { subject: 'First touch', status: 'sent', sent_at: '2026-07-01T10:00:00Z', created_at: '2026-07-01T09:00:00Z' },
      { subject: 'Draft never sent', status: 'draft', sent_at: null, created_at: '2026-07-02T09:00:00Z' },
    ],
    replies: [{ subject: 'Re: First touch', classification: 'positive', received_at: '2026-07-03T12:00:00Z' }],
    leads: [{ message: 'Do you take commissions?', source: 'postcard-qr', created_at: '2026-07-02T15:00:00Z' }],
    notes: [{ body: 'Called, left voicemail', created_at: '2026-07-04T08:00:00Z' }],
  });
  check('only SENT messages count as activity (a draft is not history)', !t.some((i) => i.text.includes('Draft never sent')) && t.some((i) => i.text.includes('First touch')));
  check('newest first', t[0].text.includes('voicemail') && t[t.length - 1].text.includes('First touch'));
  check('reply labeled with classification + tone in', t.some((i) => i.kind === 'reply' && i.tone === 'in' && i.text.includes('positive')));
  check('lead carries source + message', t.some((i) => i.kind === 'lead' && i.text.includes('postcard-qr') && i.text.includes('commissions')));
  check('note is note-toned', t.some((i) => i.kind === 'note' && i.tone === 'note'));
  check('every item is a real row (4 shown, the draft dropped)', t.length === 4);
}
{
  check('empty everything → empty timeline, no throw', mergeTimeline({ messages: [], replies: [], leads: [], notes: [] }).length === 0);
  const det = { messages: [], replies: [{ subject: 'a', classification: 'neutral', received_at: '2026-07-01T00:00:00Z' }], leads: [], notes: [] };
  check('deterministic', JSON.stringify(mergeTimeline(det)) === JSON.stringify(mergeTimeline(det)));
}

console.log(`\ncontacts.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} contacts check(s) failed`);
