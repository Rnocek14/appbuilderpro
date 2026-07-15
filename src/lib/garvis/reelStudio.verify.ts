// Run: npx tsx src/lib/garvis/reelStudio.verify.ts
// The reel studio is its own three-stage pipeline (Ideation → Script → Scene), not a flat IdeaStudio
// spec, so it gets its own suite. Proves the contract the UI leans on: every format ideates, scripts,
// and stages honestly — real topic fills in, unknowns are visible [EDIT] holes, the arc is Hook-first /
// CTA-last, timing is canonical, on-screen text stays short, and narration never engagement-farms.
import {
  REEL_FORMATS, REEL_BANNED, reelFormatById, reelIdeas, reelScript, reelScenes, reelCaption, reelToText,
  type SceneRole,
} from './reelStudio';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('reelStudio.verify');

const ROLES = new Set<SceneRole>(['hook', 'value', 'escalation', 'peak', 'cta']);
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const hasBanned = (s: string) => REEL_BANNED.some((b) => s.toLowerCase().includes(b));

check('there are ≥6 formats with unique ids', REEL_FORMATS.length >= 6 && new Set(REEL_FORMATS.map((f) => f.id)).size === REEL_FORMATS.length);

for (const f of REEL_FORMATS) {
  const tag = f.id;
  check(`[${tag}] has name/emoji/blurb/sample/look`, !!f.name && !!f.emoji && !!f.blurb && !!f.sample && !!f.look);

  // --- Stage 1: ideation ------------------------------------------------------------------------
  const realIdeas = reelIdeas(tag, 'vintage watches', 0);
  const holeIdeas = reelIdeas(tag, '', 0);
  check(`[${tag}] ideas: ≥3 concepts for a real topic`, realIdeas.length >= 3);
  check(`[${tag}] ideas: unique ids`, new Set(realIdeas.map((i) => i.id)).size === realIdeas.length);
  check(`[${tag}] ideas: every concept has title/angle/hook/why + carries its topic`,
    realIdeas.every((i) => !!i.title && !!i.angle && !!i.hookLine && !!i.whyItWorks && i.topic === 'vintage watches'));
  check(`[${tag}] ideas: a real topic fills in (no [EDIT: your topic]); an empty one holes it`,
    realIdeas.every((i) => !/\[EDIT: your topic\]/.test(i.title + i.angle + i.hookLine)) &&
    holeIdeas.some((i) => /\[EDIT: your topic\]/.test(i.title + i.angle)));
  // "another angle" (variant) must surface a different hook for the same lead concept.
  const hookV0 = reelIdeas(tag, 'vintage watches', 0)[0].hookLine;
  const hookV1 = reelIdeas(tag, 'vintage watches', 1)[0].hookLine;
  check(`[${tag}] ideas: a new variant rotates the concept/hook`, hookV0 !== hookV1);

  // --- Stage 2: script --------------------------------------------------------------------------
  const idea = realIdeas[0];
  const sc = reelScript(tag, idea, 0)!;
  check(`[${tag}] script: exists with a spine + ≥4 beats`, !!sc && !!sc.spine && sc.beats.length >= 4);
  check(`[${tag}] script: opens on a hook, ends on a CTA`, sc.beats[0].role === 'hook' && sc.beats[sc.beats.length - 1].role === 'cta');
  check(`[${tag}] script: every beat has a valid role + label + narration + positive seconds`,
    sc.beats.every((b) => ROLES.has(b.role) && !!b.label && !!b.narration && b.seconds > 0));
  check(`[${tag}] script: the hook narration IS the idea's chosen hook`, sc.beats[0].narration === idea.hookLine);
  check(`[${tag}] script: runtime is the sum of the beats`, sc.runtime === sc.beats.reduce((s, b) => s + b.seconds, 0));
  check(`[${tag}] script: on-screen text stays short (≤6 words) so it reads on a phone`, sc.beats.every((b) => wordCount(b.onscreen) <= 6));
  check(`[${tag}] script: no engagement-farm filler in any narration`, sc.beats.every((b) => !hasBanned(b.narration)));

  // --- Stage 3: scenes --------------------------------------------------------------------------
  const scenes = reelScenes(f, sc);
  check(`[${tag}] scenes: one fully-staged scene per beat`, scenes.length === sc.beats.length);
  check(`[${tag}] scenes: every scene carries subject/action/environment/camera/mood/cut + a zone`,
    scenes.every((s) => !!s.subject && !!s.action && !!s.environment && !!s.camera && !!s.mood && !!s.cut && !!s.zone));
  check(`[${tag}] scenes: indices are 0..n-1 in order`, scenes.every((s, i) => s.index === i));
  check(`[${tag}] scenes: the hook is a 'hook' zone, the CTA a 'payoff' zone`,
    scenes[0].zone === 'hook' && scenes[scenes.length - 1].zone === 'payoff');

  // --- honesty on an unknown topic --------------------------------------------------------------
  const holeIdea = holeIdeas[0];
  const holeScript = reelScript(tag, holeIdea, 0)!;
  const holeBlob = holeScript.beats.map((b) => `${b.onscreen} ${b.narration}`).join('\n');
  check(`[${tag}] honesty: with no topic, the specifics are visible [EDIT] holes — never invented`, /\[EDIT/.test(holeBlob));
  check(`[${tag}] honesty: still no filler even on the holed script`, holeScript.beats.every((b) => !hasBanned(b.narration)));

  // --- compose / caption ------------------------------------------------------------------------
  const blob = reelToText(f, idea, sc, scenes, 0);
  check(`[${tag}] compose: the blob carries the topic, the spine, and every scene`,
    blob.includes(idea.topic) && blob.includes(sc.spine) && scenes.every((s) => blob.includes(s.narration)));
}

// --- caption honesty: real topic → a real hashtag; unknown topic → an [EDIT] hole ---------------
check('caption: a real topic becomes a hashtag', /#vintagewatches/.test(reelCaption('vintage watches', 0)));
check('caption: an unknown topic holes the niche tag, never invents one', /#\[EDIT: niche\]/.test(reelCaption('', 0)));

// --- unknown ids never crash --------------------------------------------------------------------
check('unknown format id → null format', reelFormatById('nope') === null);
check('unknown format id → empty ideas', reelIdeas('nope', 'x', 0).length === 0);
check('unknown format id → null script', reelScript('nope', reelIdeas(REEL_FORMATS[0].id, 'x', 0)[0], 0) === null);

console.log(`\nreelStudio.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} reelStudio check(s) failed`);
