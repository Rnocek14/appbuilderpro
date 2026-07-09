// src/lib/garvis/intake.verify.ts
// Run: npx tsx src/lib/garvis/intake.verify.ts

import { normalizeIntake, isImageFile, defaultLabel, SUGGESTED_USES } from './intake';

let passed = 0; let failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('intake.verify');

const FULL = {
  document_id: 'd1', summary: 'A bronze heron mid-flight.', concepts: ['bronze', 'wildlife'],
  vision: {
    subject: 'bronze heron sculpture', style: 'realist', medium: 'bronze',
    colors: ['bronze', 'green'], mood: 'serene', themes: ['wildlife', 'water'],
    suggested_use: ['website', 'social', 'billboard'],   // one invalid — must be filtered
    quality_note: 'hero-grade: sharp, clean background',
  },
  why_matters: 'Strongest portfolio piece for commission pitches.',
  open_question: 'Is this piece still for sale?',
  suggested_world_id: 'w1',
};

{
  const it = normalizeIntake(FULL, 'heron.jpg');
  check('a full vision response normalizes', !!it && it.documentId === 'd1' && it.vision?.subject === 'bronze heron sculpture');
  check('invalid suggested uses are filtered to the known set', !!it && it.vision!.suggested_use.length === 2 && it.vision!.suggested_use.every((u) => (SUGGESTED_USES as readonly string[]).includes(u)));
  check('why-this-matters and the open question survive', !!it && it.whyMatters!.includes('commission') && it.openQuestion!.includes('for sale'));
  check('the proposal is carried, never auto-filed here', !!it && it.suggestedWorldId === 'w1');
  check('default label = the model\'s first valid suggestion', defaultLabel(it!.vision) === 'website');
}
{
  const doc = normalizeIntake({ document_id: 'd2', summary: 'Notes.', concepts: [] }, 'notes.txt');
  check('a text document normalizes with vision null', !!doc && doc.vision === null && doc.summary === 'Notes.');
  check('defaultLabel of a text doc is null — no invented routing', defaultLabel(doc!.vision) === null);
  check('a response with no document_id is rejected', normalizeIntake({ summary: 'x' }, 't') === null);
  check('garbage never throws', normalizeIntake('nope', 't') === null && normalizeIntake(null, 't') === null);
}
{
  check('mime detection: image/*', isImageFile('a.bin', 'image/jpeg'));
  check('extension fallback: .PNG', isImageFile('Art.PNG', 'application/octet-stream'));
  check('a docx is not an image', !isImageFile('brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
}

console.log(`\nintake.verify: ${passed} passed, ${failed} failed`);
// Throw (not process.exit) so this file needs no @types/node.
if (failed > 0) throw new Error(`${failed} intake check(s) failed`);
