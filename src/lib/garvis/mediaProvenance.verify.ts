// Run: npx tsx src/lib/garvis/mediaProvenance.verify.ts
// The AI-provenance label is an honesty guarantee: AI media is always disclosed, the label can't be
// stripped, and the disclosure is applied exactly once. These checks pin all three.
import {
  aiProvenance, stampProvenance, requiresDisclosure, hasDisclosure, withDisclosure, disclosureGate,
  AI_DISCLOSURE, AI_DISCLOSURE_TAG, type AiProvenance,
} from './mediaProvenance';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('mediaProvenance.verify');

const img = aiProvenance('image', 'gpt-image-1', 1000);
const clip = aiProvenance('video', 'sora', 2000, 'sora-1');

// --- label shape --------------------------------------------------------------------------
check('aiProvenance marks the media AI-generated with its tool', img.aiGenerated === true && img.kind === 'image' && img.tool === 'gpt-image-1');
check('model is optional and included when given', clip.model === 'sora-1' && img.model === undefined);

// --- immutability: provenance only accretes -----------------------------------------------
check('a first stamp wins', stampProvenance(null, img) === img);
const later = aiProvenance('image', 'human-uploaded-somehow', 9999);
check('an existing AI label can NEVER be replaced (no laundering AI → not-AI)', stampProvenance(img, later) === img);

// --- disclosure requirement ---------------------------------------------------------------
check('AI media requires disclosure; non-AI does not', requiresDisclosure(img) === true && requiresDisclosure(null) === false);

// --- withDisclosure: applied once, idempotent, only for AI --------------------------------
const cap = 'JUST SOLD in Lake Geneva 🎉\n\n#JustSold';
const disclosed = withDisclosure(cap, img);
check('AI caption gains the disclosure sentence', disclosed.includes(AI_DISCLOSURE) && disclosed !== cap);
check('applying twice does not double the disclosure', withDisclosure(disclosed, img) === disclosed);
check('a caption already carrying #AI is left alone', withDisclosure(`hello ${AI_DISCLOSURE_TAG}`, img) === `hello ${AI_DISCLOSURE_TAG}`);
check('non-AI media is never altered', withDisclosure(cap, null) === cap);
check('empty caption gets a bare disclosure, no leading blank lines', withDisclosure('', img) === `${AI_DISCLOSURE}.`);

// --- the publish gate ---------------------------------------------------------------------
check('the gate BLOCKS an undisclosed AI post', disclosureGate(cap, img) !== null);
check('the gate CLEARS once disclosed', disclosureGate(disclosed, img) === null);
check('the gate always clears non-AI media', disclosureGate(cap, null) === null);
check('hasDisclosure detects both the sentence and the tag', hasDisclosure(`x ${AI_DISCLOSURE}.`) && hasDisclosure('x #ai y') && !hasDisclosure('nothing here'));

// --- deterministic ------------------------------------------------------------------------
const p2: AiProvenance = aiProvenance('audio', 'elevenlabs', 3000);
check('audio kind supported', p2.kind === 'audio');

console.log(`\nmediaProvenance.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} mediaProvenance check(s) failed`);
