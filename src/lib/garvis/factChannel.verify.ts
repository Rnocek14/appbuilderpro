// Run: npx tsx src/lib/garvis/factChannel.verify.ts
import {
  parseFactScript, scriptTotalSeconds, bandCheck, scriptToScenes, illustrationPrompt,
  composeCaption, ctaLink, deliveryInstructions, ILLUSTRATION_GUARDRAILS, CHANNEL_PRESETS,
} from './factChannel';

let passed = 0; let failed = 0;
const check = (n: string, c: boolean) => { if (c) { passed++; console.log(`  ok  - ${n}`); } else { failed++; console.error(`  FAIL - ${n}`); } };
console.log('factChannel.verify');

const good = {
  title: 'Why banks love your idle cash',
  hooks: ['Your bank made $312 off you last year.', 'The $312 your bank never mentions.', 'Banks profit from YOUR laziness — here is how.'],
  scenes: [
    { voiceover: 'Every dollar in your checking account gets lent back out at interest.', onScreen: 'Your cash works — for them', imagePrompt: 'a river of coins flowing into a bank vault', seconds: 6 },
    { voiceover: 'The average checking account pays 0.07 percent. Inflation runs far higher.', onScreen: '0.07% vs inflation', imagePrompt: 'a tiny sprout next to a shrinking ice block', seconds: 6 },
    { voiceover: 'High-yield accounts pay fifty times more, with the same insurance.', onScreen: '50x — same FDIC', imagePrompt: 'two identical safes, one glowing', seconds: 6 },
  ],
  caption: 'Where your idle cash actually goes.', cta: 'Follow for one money mechanic a day.',
  hashtags: ['finance', '#money', 'facts'],
  sources: [{ claim: 'average checking APY', url: 'https://www.fdic.gov/national-rates', note: 'FDIC national rates' }],
  confidence: 0.8,
};

{
  const r = parseFactScript(good);
  check('a well-formed script parses ok', r.ok);
  if (r.ok) {
    check('cited script is NOT flagged needs_review', r.script.needsReview === false && r.warnings.length === 0);
    check('hashtags normalize (# stripped once)', r.script.hashtags.join() === 'finance,money,facts');
    check('three hook variants survive', r.script.hooks.length === 3);
    check('deterministic', JSON.stringify(parseFactScript(good)) === JSON.stringify(r));
  }
}
{
  const r = parseFactScript({ ...good, sources: [] });
  check('a script with NO sources still parses but is flagged needs_review, visibly',
    r.ok && r.script.needsReview === true && r.warnings.some((w) => w.includes('UNVERIFIED')));
  const bad = parseFactScript({ ...good, sources: [{ claim: 'x', url: 'not-a-url' }] });
  check('a non-URL source is dropped (never a fake citation)', bad.ok && bad.script.needsReview === true);
}
{
  check('garbage → honest refusal, no throw', parseFactScript('nonsense').ok === false && parseFactScript(null).ok === false);
  check('no hooks → refusal', parseFactScript({ ...good, hooks: [] }).ok === false);
  check('no scenes → refusal', parseFactScript({ ...good, scenes: [] }).ok === false);
  const clamped = parseFactScript({ ...good, scenes: [{ voiceover: 'v', onScreen: 'o', imagePrompt: 'p', seconds: 99 }] });
  check('scene seconds clamp to the 4-6 stills band (static past ~4s; captions+motion buy 6)', clamped.ok && clamped.script.scenes[0].seconds === 6);
  const floor = parseFactScript({ ...good, scenes: [{ voiceover: 'v', onScreen: 'o', imagePrompt: 'p', seconds: 1 }] });
  check('too-short beats clamp up to 4s', floor.ok && floor.script.scenes[0].seconds === 4);
}
{
  const r = parseFactScript(good);
  if (r.ok) {
    const total = scriptTotalSeconds(r.script);
    check('total = hook beat + value beats', total === 3 + 18);
    check('under 60s is called out honestly (not CRP-eligible)', bandCheck(total).ok === false && !!bandCheck(total).note?.includes('60'));
    check('the 60-90 band passes', bandCheck(75).ok === true && bandCheck(75).note === null);
    check('over 90s is called out', bandCheck(95).ok === false);
    const { scenes, imagePrompts } = scriptToScenes(r.script, 1);
    check('the chosen hook variant becomes scene 0', scenes[0].voiceover === good.hooks[1]);
    check('every value beat follows in order', scenes.length === 4 && scenes[3].voiceover?.includes('fifty times') === true);
    check('image prompts align per scene, hook borrows the first beat\'s art', imagePrompts.length === 4 && imagePrompts[0] === good.scenes[0].imagePrompt);
    check('an out-of-range hook index clamps, never crashes', scriptToScenes(r.script, 99).scenes[0].voiceover === good.hooks[2]);
  }
}
{
  const p = illustrationPrompt('a river of coins', 'flat navy-and-gold editorial style');
  check('illustration prompts always carry the guardrails clause', p.includes(ILLUSTRATION_GUARDRAILS) && p.includes('flat navy-and-gold'));
  check('guardrails ban text/logos/real people', /No text/.test(ILLUSTRATION_GUARDRAILS) && /real people/.test(ILLUSTRATION_GUARDRAILS) && /logos/.test(ILLUSTRATION_GUARDRAILS));
  const r = parseFactScript(good);
  if (r.ok) {
    const cap = composeCaption(r.script);
    check('caption composes caption + CTA + tags', cap.includes('idle cash') && cap.includes('Follow for') && cap.includes('#finance'));
  }
  check('channel presets are distinct brand postures', new Set(CHANNEL_PRESETS.map((c) => c.visualStyle)).size === CHANNEL_PRESETS.length);
  check('preset style blocks lock a named palette with drift suppressors', CHANNEL_PRESETS.every((c) => /palette:/.test(c.visualStyle) && /no gradients/.test(c.visualStyle)));
  check('every preset names a TTS voice', CHANNEL_PRESETS.every((c) => c.voice.length > 0));
}
{
  // The TTS delivery direction — where pacing/energy actually live (the model's speed param is ignored).
  const d = deliveryInstructions('Calm, precise, slightly wry.');
  check('delivery uses the labeled-axis grammar (Voice/Tone/Pacing/Pauses)', /Voice Affect:/.test(d) && /Pacing:/.test(d) && /Pauses:/.test(d));
  check('numbers get landed deliberately', d.includes('land each number'));
  check('no lead-in silence — the first two seconds decide distribution', d.includes('Start speaking immediately'));
  check('the channel persona is woven in', d.includes('slightly wry'));
  check('an empty persona still yields a full direction', deliveryInstructions('').includes('Voice Affect:') && !deliveryInstructions('').includes('Personality:'));
  check('deterministic', deliveryInstructions('x') === deliveryInstructions('x'));
}
{
  // The money route: every episode caption can carry the channel's ATTRIBUTED destination link.
  const id = 'abcd1234-5678-9abc-def0-123456789abc';
  check('ctaLink stamps the channel src tag', ctaLink('https://shop.example.com', id) === 'https://shop.example.com?src=gc_abcd1234');
  check('per-episode utm_content answers "which video sold this"',
    ctaLink('https://shop.example.com', id, 'e1f2a3b4-0000-1111-2222-333344445555') === 'https://shop.example.com?src=gc_abcd1234&utm_content=ep_e1f2a3b4');
  check('existing query strings get & not ?', ctaLink('https://shop.example.com?ref=x', id).includes('?ref=x&src=gc_'));
  check('an already-attributed link is not double-stamped', ctaLink('https://x.com/p?src=mine', id) === 'https://x.com/p?src=mine');
  check('a non-URL destination yields NO link, never a broken one', ctaLink('my shop', id) === '' && ctaLink('', id) === '');
  const r = parseFactScript(good);
  if (r.ok) {
    const cap = composeCaption(r.script, ctaLink('https://shop.example.com', id));
    check('the attributed link rides the caption next to the CTA', cap.includes('src=gc_abcd1234') && cap.indexOf('Follow for') < cap.indexOf('src=gc_'));
    check('no link → the caption is unchanged from the linkless form', composeCaption(r.script) === composeCaption(r.script, ''));
  }
}

console.log(`\nfactChannel.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} factChannel check(s) failed`);
