// src/lib/garvis/deliverable.verify.ts
// Run: npx tsx src/lib/garvis/deliverable.verify.ts
// Verifies the Deliverable Generator's pure core: the markdown parse is tolerant and lossless, the
// honesty gate refuses a thin draft but allows a brief-only document (grounded reflects the KB), gaps
// are surfaced, and the serializers (markdown, plain text, Word XML, saved record) are deterministic
// and safe (XML escaped).

import {
  parseDocument, decideDeliverable, toMarkdown, toPlainText, docxDocumentXml, deliverableArtifact,
  buildDeliverUser, DOC_TYPES, isDocType, type DeliverSource,
} from './deliverable';

let passed = 0, failed = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { passed++; console.log(`  ok  - ${name}`); }
  else { failed++; console.error(`  FAIL - ${name}`); }
};

console.log('deliverable.verify');

const SRC: DeliverSource[] = [
  { id: 'a', title: 'Rate card', snippet: 'Standard rate is $150/hr; project minimums apply.', where: 'Pricing' },
  { id: 'b', title: 'Past project', snippet: 'Delivered the Miller kitchen remodel in 6 weeks.', where: 'Portfolio' },
];

// 1 — parse: title + headed sections.
{
  const raw = '# Kitchen Remodel Proposal\n\nIntro line before any heading.\n\n## Scope of work\n\nDemo and rebuild.\n\n## Investment\n\n- Labor\n- Materials';
  const { title, sections } = parseDocument(raw, 'proposal', 'Miller family');
  check('h1 becomes the title', title === 'Kitchen Remodel Proposal');
  check('lead text before first heading is kept (heading "")', sections[0].heading === '' && sections[0].body.includes('Intro line'));
  check('headed sections are split out', sections.some((s) => s.heading === 'Scope of work') && sections.some((s) => s.heading === 'Investment'));
  check('bullet body is preserved verbatim', sections.find((s) => s.heading === 'Investment')?.body.includes('- Labor') === true);
}

// 2 — parse tolerance: code fences stripped; no-heading doc kept as one section; empty → fallback title.
{
  const fenced = parseDocument('```markdown\n# Report\n\nBody here that is real.\n```', 'report', 'Q3');
  check('code fences are stripped', fenced.title === 'Report' && !toMarkdown({ ...blank('report'), title: fenced.title, sections: fenced.sections }).includes('```'));
  const noHead = parseDocument('Just a wall of text with no headings at all, still a document.', 'letter', 'Jane');
  check('a heading-less doc becomes one section, nothing dropped', noHead.sections.length === 1 && noHead.sections[0].body.includes('wall of text'));
  const empty = parseDocument('   ', 'brief', 'Team');
  check('empty input falls back to a typed title', empty.title === 'Brief — Team' && empty.sections.length === 0);
}

// 3 — the gate: a real document stands; grounded reflects whether the KB backed it.
{
  const { sections } = parseDocument('# Proposal\n\n## Overview\n\nWe will remodel your kitchen with care and a clear plan that fits your budget. [needs your input: start date]\n\n## Investment\n\nStandard rate applies [1].', 'proposal', 'Miller');
  const d = decideDeliverable({ docType: 'proposal', subject: 'Miller', title: 'Proposal', sections, sources: SRC });
  check('a real document is not refused', d.refusal === null && d.sections.length >= 1);
  check('grounded is true when KB sources are attached', d.grounded === true && d.sources.length === 2);
  check('the [needs your input] gap is surfaced', d.gaps.length === 1 && d.gaps[0] === 'start date');
}

// 4 — a brief-only document is allowed (NOT refused), just not grounded.
{
  const { sections } = parseDocument('# One-pager\n\n## What it is\n\nA clear single-page overview of the offering, written from the brief with real substance and structure.', 'one_pager', 'Acme');
  const d = decideDeliverable({ docType: 'one_pager', subject: 'Acme', title: 'One-pager', sections, sources: [] });
  check('no knowledge base is fine for a deliverable (composed from the brief)', d.refusal === null && d.grounded === false);
}

// 5 — a too-thin draft IS refused, and the refusal names the fix.
{
  const d = decideDeliverable({ docType: 'report', subject: 'x', title: 'Report', sections: [{ heading: 'Summary', body: 'too short' }], sources: SRC });
  check('a thin draft is refused as not a real document', d.refusal !== null && d.sections.length === 0);
  check('the refusal names the fix (fuller brief / source material)', /brief|source material/i.test(d.refusal ?? ''));
}

// 6 — serializers are deterministic and safe.
{
  const doc = decideDeliverable({
    docType: 'proposal', subject: 'Miller & Sons <urgent>', title: 'Proposal for Miller & Sons',
    sections: [
      { heading: 'Overview', body: 'Plan & price for the <remodel> of your kitchen, with a clear scope and a fixed timeline you can rely on.' },
      { heading: 'Investment', body: '- Labor\n- Materials' },
    ],
    sources: SRC,
  });
  check('markdown round-trips the structure', toMarkdown(doc) === '# Proposal for Miller & Sons\n\n## Overview\n\nPlan & price for the <remodel> of your kitchen, with a clear scope and a fixed timeline you can rely on.\n\n## Investment\n\n- Labor\n- Materials');
  check('plain text softens bullets to •', toPlainText(doc).includes('• Labor') && toPlainText(doc).includes('OVERVIEW'));
  const xml = docxDocumentXml(doc);
  check('docx XML escapes &, <, > (no raw ampersand/brackets from content)', xml.includes('Miller &amp; Sons') && xml.includes('&lt;remodel&gt;') && !xml.includes('Miller & Sons'));
  check('docx XML carries the title, a heading, and a bullet run', xml.includes('Proposal for Miller') && xml.includes('Investment') && xml.includes('• Labor'));
  check('docx XML is a single well-formed document element', xml.startsWith('<?xml') && xml.includes('<w:document') && xml.trim().endsWith('</w:document>'));
  const x2 = docxDocumentXml(doc);
  check('docx XML is deterministic', xml === x2);
}

// 7 — the saved record is deterministic and cites its sources.
{
  const doc = decideDeliverable({ docType: 'report', subject: 'Q3 review', title: 'Q3 Report', sections: [{ heading: 'Summary', body: 'A full and real summary of the quarter with enough substance to stand.' }], sources: SRC });
  const a1 = deliverableArtifact(doc), a2 = deliverableArtifact(doc);
  check('artifact id is deterministic for the same type+subject', a1.id === a2.id && a1.id.startsWith('doc-'));
  check('artifact is a garvis doc that cites its sources', a1.kind === 'doc' && a1.source === 'garvis' && a1.detail.includes('Rate card'));
}

// 8 — prompt + registry basics.
{
  const u = buildDeliverUser('proposal', 'Miller family', 'Focus on the timeline and warranty.', SRC, 'warm and professional');
  check('prompt carries doc type, subject, brief, sources, and tone', u.includes('proposal') && u.includes('Miller family') && u.includes('warranty') && u.includes('[1] Rate card') && u.includes('warm and professional'));
  const uEmpty = buildDeliverUser('brief', 'Team', '', [], null);
  check('empty KB is stated honestly, not faked', uEmpty.includes('no knowledge base was attached'));
  check('DOC_TYPES is complete and isDocType guards it', isDocType('proposal') && !isDocType('nonsense') && Object.keys(DOC_TYPES).length === 6);
}

function blank(docType: 'report'): Parameters<typeof toMarkdown>[0] {
  return { docType, title: '', subject: '', sections: [], sources: [], grounded: false, refusal: null, gaps: [], costUsd: 0 };
}

console.log(`\ndeliverable.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} deliverable check(s) failed`);
