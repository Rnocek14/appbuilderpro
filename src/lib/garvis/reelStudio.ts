// src/lib/garvis/reelStudio.ts
// THE REEL STUDIO CORE — a real short-video pipeline for a faceless content account (the content_growth
// world), modeled on the traction-engine repo's Idea → Script → Storyboard flow. Three honest stages:
//
//   1. IDEATION   pick a format + your topic → several distinct ANGLE concepts (title, the angle, the
//                 exact 3-second hook, why it retains). You choose one.
//   2. SCRIPT     the chosen idea becomes a beat-by-beat SCRIPT with a story spine and Hook → Value →
//                 Escalation → Peak → CTA beats — each a VO line + on-screen text (≤6 words) + timing.
//                 The storyboard's timing is the authority (traction-engine's "script-first").
//   3. SCENE      every beat expands into a SHOT: subject, action, environment, camera, mood, cut — the
//                 direction a video model needs. Same beat words, now fully staged.
//
// HONESTY (same rule as every studio): real inputs fill in (your topic), and every specific we can't
// know — the actual fact, the item, the number — is a visible [EDIT: …] hole you complete, never
// invented. Narration is written to be SPECIFIC (a fact, number, or comparison) and deliberately avoids
// engagement-farm filler (traction-engine's banned-phrase rule). A storyboard is a SEED: turning it into
// a real vertical video needs a connected video model (the clip engine) — this studio never fakes footage.
//
// Pure + deterministic (no Date/random) — verified by reelStudio.verify.ts.

import { pick } from './studioKit';

// ---- the shape of a reel ---------------------------------------------------------------------

/** A beat's job in the arc. Mirrors traction-engine's SceneRole (hook/value/escalation/peak/cta). */
export type SceneRole = 'hook' | 'value' | 'escalation' | 'peak' | 'cta';

/** One beat of the script — the words + timing. The storyboard timing is canonical. */
export interface ReelBeat {
  role: SceneRole;
  label: string;      // human label, e.g. "Hook · 0–3s", "#1 · the payoff", "CTA"
  onscreen: string;   // on-screen text — kept short (≤6 words) so it reads on a phone
  narration: string;  // the voiceover line — specific, or a visible [EDIT] hole
  seconds: number;    // duration target for this beat
  // the visual seed the SCENE stage expands (kept on the beat so script→scene is lossless):
  subject: string;    // who / what is on screen
  action: string;     // what happens in the shot
}

/** A scene = a beat, fully staged for the video model: the shot direction the clip engine needs. */
export interface ReelScene extends ReelBeat {
  index: number;
  zone: 'hook' | 'setup' | 'payoff';
  environment: string;   // where / the setting
  camera: string;        // camera direction
  mood: string;          // tone + palette
  cut: string;           // how we cut in
}

/** One idea concept from the ideation stage — the creative angle, before it's scripted. */
export interface ReelIdea {
  id: string;
  topic: string;       // the resolved topic (real, or a visible [EDIT: your topic] hole)
  title: string;       // the working title of the reel
  angle: string;       // the angle in one line
  hookLine: string;    // the exact first-3-seconds hook (spoken + implied on-screen)
  whyItWorks: string;  // why this format/angle retains + spreads
}

/** A full script for a chosen idea — the story spine + the ordered beats. */
export interface ReelScript {
  spine: string;       // the arc in one line, e.g. "curiosity → reveal → proof → payoff → follow"
  beats: ReelBeat[];
  runtime: number;     // sum of beat seconds
}

/** A reel format = a gallery entry + its three pipeline stages. */
export interface ReelFormat {
  id: string;
  name: string;
  emoji: string;
  blurb: string;       // when to use it (gallery card)
  sample: string;      // teaser line (gallery card)
  look: string;        // the format's visual language (drives every scene's environment)
  ideas: (topic: string, variant: number) => ReelIdea[];
  script: (idea: ReelIdea, variant: number) => ReelScript;
}

// ---- shared honesty + helpers ----------------------------------------------------------------

const topicOr = (topic: string): string => { const t = (topic || '').trim(); return t || '[EDIT: your topic]'; };
const isHole = (s: string): boolean => /\[EDIT/.test(s);
const slug = (T: string): string => (isHole(T) ? '[EDIT: niche]' : T.toLowerCase().replace(/[^a-z0-9]+/g, '') || '[EDIT: niche]');

/** Filler that engagement-farms without saying anything — banned from narration (traction-engine rule). */
export const REEL_BANNED: string[] = [
  'game changer', "you won't believe", 'you wont believe', 'confidence is key', 'mind blowing',
  'mind-blowing', 'the possibilities are endless', 'next level', 'at the end of the day',
  'little did they know', 'trust me', 'this one simple trick', 'without a doubt',
];

function windowOf<T>(arr: T[], start: number, n: number): T[] {
  const k = Math.min(n, arr.length);
  return Array.from({ length: k }, (_, i) => arr[(((start + i) % arr.length) + arr.length) % arr.length]);
}

/** The visual seed for a beat, by role — the SCENE stage layers camera/mood/etc. on top. Kept a scaffold
 *  because the actual subject is the owner's topic; specificity comes from the [EDIT] holes they fill. */
function shotSeed(role: SceneRole, T: string, noun: string): { subject: string; action: string } {
  const subject: Record<SceneRole, string> = {
    hook: `Bold title card over a striking image tied to ${T}`,
    value: `A clean visual that carries the ${noun} — simple b-roll or a graphic about ${T}`,
    escalation: `A sharper, higher-energy visual that drives the ${noun} home`,
    peak: `The hero shot — the single most striking image tied to ${T}`,
    cta: `Simple end card: the account handle and a follow cue`,
  };
  const action: Record<SceneRole, string> = {
    hook: 'Text slams on with a fast zoom — motion in the very first frame',
    value: 'Steady push-in while the caption and voiceover land',
    escalation: 'Quicker cut, tighter crop; the key detail gets highlighted',
    peak: 'Pull-back or hero close-up, then hold a beat — let it land',
    cta: 'Everything settles; the handle and follow cue sit still',
  };
  return { subject: subject[role], action: action[role] };
}

/** Build one beat, auto-seeding its shot from the role + topic + this format's content noun. */
const B = (role: SceneRole, label: string, onscreen: string, narration: string, seconds: number, T: string, noun: string): ReelBeat =>
  ({ role, label, onscreen, narration, seconds, ...shotSeed(role, T, noun) });

const script = (spine: string, beats: ReelBeat[]): ReelScript =>
  ({ spine, beats, runtime: beats.reduce((s, b) => s + b.seconds, 0) });

// ---- ideation: shared angle → idea builder ---------------------------------------------------

interface Angle {
  key: string;
  title: (T: string) => string;
  angle: (T: string) => string;
  hooks: (T: string) => string[];   // ≥2, so "another angle" gives a fresh hook
  why: string;
}

function makeIdeas(prefix: string, angles: Angle[], topic: string, variant: number): ReelIdea[] {
  const T = topicOr(topic);
  return windowOf(angles, variant, 3).map((a) => ({
    id: `${prefix}_${a.key}`,
    topic: T,
    title: a.title(T),
    angle: a.angle(T),
    hookLine: pick(a.hooks(T), variant),
    whyItWorks: a.why,
  }));
}

// =============================================================================================
// THE FORMATS — each a gallery entry with its own ideation + script. Six strong faceless formats.
// =============================================================================================

const FMT: ReelFormat[] = [
  // ---- 1. Did-you-know fact drop -------------------------------------------------------------
  {
    id: 'fact', name: '“Did you know?” fact drop', emoji: '🤯',
    blurb: 'A surprising fact that stops the scroll — the highest-retention faceless format.',
    sample: 'Most people have [EDIT] completely backwards…',
    look: 'high-contrast, bold sans captions, one clear fact per scene',
    ideas: (topic, v) => makeIdeas('fact', [
      { key: 'backwards', title: (T) => `The truth about ${T} nobody checks`, angle: (T) => `Take one thing everyone assumes about ${T} and flip it with a real fact.`,
        hooks: (T) => [`Most people have ${T} completely backwards. Here's the fact.`, `Here's what nobody tells you about ${T}.`], why: 'A curiosity gap + a payoff is the single most-rewatched short-form shape.' },
      { key: 'hidden', title: (T) => `The hidden side of ${T}`, angle: (T) => `Reveal a detail about ${T} that's hiding in plain sight.`,
        hooks: (T) => [`There's a hidden side to ${T} almost nobody notices.`, `99% of people miss this about ${T}.`], why: 'Insider-knowledge framing makes viewers feel let in on a secret — high saves + shares.' },
      { key: 'origin', title: (T) => `Where ${T} actually came from`, angle: (T) => `The surprising origin or reason behind ${T}.`,
        hooks: (T) => [`The real reason ${T} exists isn't what you think.`, `${T} started for a completely different reason.`], why: 'Origin stories carry built-in narrative tension in under 30 seconds.' },
      { key: 'number', title: (T) => `The number that reframes ${T}`, angle: (T) => `One statistic that changes how you see ${T}.`,
        hooks: (T) => [`One number completely changes how you see ${T}.`, `This stat about ${T} stopped me cold.`], why: 'A single hard number is concrete, screenshot-able, and easy to argue about in comments.' },
    ], topic, v),
    script: (idea, v) => {
      const T = idea.topic; const noun = 'fact';
      return script('curiosity gap → the setup → the reveal → why it matters → follow', [
        B('hook', 'Hook · 0–3s', 'Wait, what?!', idea.hookLine, 3, T, noun),
        B('value', 'The setup · 3–9s', 'Here’s the truth', `Most people assume [EDIT: the common belief about ${T}] — but that's not what's actually going on.`, 6, T, noun),
        B('escalation', 'The reveal · 9–17s', '[EDIT: the surprise]', `The real story: [EDIT: the specific fact — a number, date, or comparison]. That one detail changes everything.`, 8, T, noun),
        B('peak', 'Why it matters · 17–24s', 'That’s why', `Which means [EDIT: the concrete takeaway for the viewer] — and almost nobody realizes it.`, 7, T, noun),
        B('cta', 'CTA · 24–28s', 'Follow for more 🧠', `Follow for one surprising ${T} fact every day.`, 4, T, noun),
      ]);
    },
  },

  // ---- 2. Top-5 countdown --------------------------------------------------------------------
  {
    id: 'top5', name: '“Top 5” countdown', emoji: '🔢',
    blurb: 'A ranked list, #5 up to #1 — endlessly rewatchable and easy to batch.',
    sample: 'Top 5 [EDIT] — #1 broke my brain',
    look: 'number badge in the corner, tight cuts, one item per scene',
    ideas: (topic, v) => makeIdeas('top5', [
      { key: 'mindblow', title: (T) => `Top 5 ${T} facts that sound fake`, angle: (T) => `Five true-but-unbelievable things about ${T}, ranked.`,
        hooks: (T) => [`Top 5 ${T} facts that sound made up — but aren't. Number one broke my brain.`, `Five things about ${T} you'll swear are fake.`], why: 'A ranking promises a payoff at #1, so viewers stay to the end — the metric the algorithm rewards.' },
      { key: 'mistakes', title: (T) => `Top 5 ${T} mistakes everyone makes`, angle: (T) => `The five most common ${T} mistakes, worst last.`,
        hooks: (T) => [`Top 5 ${T} mistakes almost everyone makes. You're probably doing number two.`, `Five ${T} mistakes that are costing you — ranked.`], why: '“Are you doing this?” framing pulls the viewer into every item personally.' },
      { key: 'underrated', title: (T) => `Top 5 underrated ${T} tips`, angle: (T) => `Five ${T} tips nobody talks about, best last.`,
        hooks: (T) => [`Top 5 ${T} tips nobody talks about. Save these.`, `Five underrated ${T} moves that actually work.`], why: 'Actionable ranked lists get saved — and saves boost reach more than likes.' },
      { key: 'ranked', title: (T) => `${T}, ranked worst to best`, angle: (T) => `Rank five things within ${T} from worst to best.`,
        hooks: (T) => [`I ranked five ${T} — worst to best. You'll disagree with number one.`, `Five ${T}, ranked. Fight me in the comments.`], why: 'A ranking people disagree with manufactures comments — the strongest engagement signal.' },
    ], topic, v),
    script: (idea, v) => {
      const T = idea.topic; const noun = 'item';
      return script('promise a ranking → climb #5→#1 → biggest reveal last → invite the argument', [
        B('hook', 'Hook · 0–3s', 'Top 5 — #1 hits', idea.hookLine, 3, T, noun),
        B('value', '#5 · 3–8s', '#5 · [EDIT]', `Number five: [EDIT: item 5, and the one specific reason it makes the list].`, 5, T, noun),
        B('value', '#4 · 8–13s', '#4 · [EDIT]', `Number four: [EDIT: item 4 — keep it concrete].`, 5, T, noun),
        B('escalation', '#3 · 13–18s', '#3 · [EDIT]', `Number three, and this one's underrated: [EDIT: item 3].`, 5, T, noun),
        B('escalation', '#2 · 18–23s', '#2 · [EDIT]', `Number two, so close to the top: [EDIT: item 2].`, 5, T, noun),
        B('peak', '#1 · the payoff · 23–30s', '#1 · [EDIT]', `And number one: [EDIT: the best item] — here's the specific reason it beats the rest.`, 7, T, noun),
        B('cta', 'CTA · 30–34s', 'Which shocked you? 👇', `Which one surprised you? Comment it — follow for part two.`, 4, T, noun),
      ]);
    },
  },

  // ---- 3. Mini-story -------------------------------------------------------------------------
  {
    id: 'story', name: 'Mini-story with a twist', emoji: '📖',
    blurb: 'A 30-second story that turns — builds watch-through and shares.',
    sample: 'The [EDIT] story nobody tells you…',
    look: 'slower cinematic cuts, atmospheric, captions carry the beats',
    ideas: (topic, v) => makeIdeas('story', [
      { key: 'untold', title: (T) => `The ${T} story nobody tells`, angle: (T) => `A lesser-known true story from the world of ${T}, with a turn.`,
        hooks: (T) => [`This is the ${T} story nobody tells you. It ends in a way you won't expect.`, `Nobody talks about what really happened with ${T}.`], why: 'Story structure (setup → tension → turn) is the deepest watch-through driver in short form.' },
      { key: 'wentwrong', title: (T) => `When ${T} went completely wrong`, angle: (T) => `The moment ${T} broke — and what happened next.`,
        hooks: (T) => [`Everything about ${T} was fine — until one moment changed it.`, `The day ${T} went completely wrong.`], why: 'A clear stakes-and-turn arc makes viewers need the resolution, so they finish.' },
      { key: 'underdog', title: (T) => `The ${T} underdog story`, angle: (T) => `Someone counted out in ${T} who flipped it.`,
        hooks: (T) => [`Nobody believed this could happen in ${T}. Then it did.`, `The ${T} underdog story that shouldn't have worked.`], why: 'Underdog arcs are the most-shared story shape — viewers pass on what they root for.' },
    ], topic, v),
    script: (idea, v) => {
      const T = idea.topic; const noun = 'story beat';
      return script('desire → tension → the turn → payoff → the lesson', [
        B('hook', 'Hook · 0–3s', 'Nobody tells this', idea.hookLine, 3, T, noun),
        B('value', 'Setup · 3–10s', 'It started small', `[EDIT: who or what this is about] wanted [EDIT: the goal]. At first everything went to plan.`, 7, T, noun),
        B('escalation', 'Tension · 10–17s', 'Then it broke', `Then [EDIT: the thing that went wrong] — and suddenly [EDIT: what was at stake].`, 7, T, noun),
        B('peak', 'The turn · 17–25s', 'But then… 😳', `But here's the turn nobody saw coming: [EDIT: the twist].`, 8, T, noun),
        B('cta', 'Lesson + CTA · 25–30s', 'The lesson 👇', `The lesson: [EDIT: the takeaway]. Follow for more stories like this.`, 5, T, noun),
      ]);
    },
  },

  // ---- 4. Myth vs. reality -------------------------------------------------------------------
  {
    id: 'myth', name: 'Myth vs. reality', emoji: '⚖️',
    blurb: 'Bust a common misconception — great for comments and duets.',
    sample: 'Everything you know about [EDIT] is wrong',
    look: 'split-screen myth/reality, red-X to green-check motif',
    ideas: (topic, v) => makeIdeas('myth', [
      { key: 'wrong', title: (T) => `The biggest myth about ${T}`, angle: (T) => `Name the belief everyone holds about ${T}, then flip it.`,
        hooks: (T) => [`Almost everything you've heard about ${T} is a myth. Here's the real version.`, `The biggest myth about ${T} — busted.`], why: 'Correcting a widely-held belief triggers “actually…” replies — comments the algorithm loves.' },
      { key: 'stop', title: (T) => `Stop believing this about ${T}`, angle: (T) => `A specific ${T} myth to retire, with the reason it's wrong.`,
        hooks: (T) => [`Stop believing this about ${T} — it's costing you.`, `This ${T} myth needs to die. Here's why.`], why: 'A direct “stop doing this” hook creates urgency and personal stakes in the first second.' },
      { key: 'everyone', title: (T) => `Why everyone gets ${T} wrong`, angle: (T) => `The shared reason people misunderstand ${T}.`,
        hooks: (T) => [`There's one reason almost everyone gets ${T} wrong.`, `Everyone repeats the same wrong thing about ${T}.`], why: '“Everyone vs. the truth” framing positions the account as the trusted correction.' },
    ], topic, v),
    script: (idea, v) => {
      const T = idea.topic; const noun = 'point';
      return script('state the myth → what people believe → flip to the truth → prove it → engage', [
        B('hook', 'Hook · 0–3s', 'This is a myth', idea.hookLine, 3, T, noun),
        B('value', 'The myth · 3–9s', 'What everyone thinks', `Almost everyone believes [EDIT: the common myth about ${T}]. It sounds completely reasonable.`, 6, T, noun),
        B('escalation', 'The reality · 9–18s', 'The reality', `But here's the truth: [EDIT: the correct fact], because [EDIT: the specific reason it's true].`, 9, T, noun),
        B('peak', 'The proof · 18–25s', 'The proof', `You can check it yourself: [EDIT: the evidence — a number, example, or before/after].`, 7, T, noun),
        B('cta', 'CTA · 25–29s', 'Did you believe it? 👇', `Did you believe the myth too? Follow — I bust one ${T} myth a day.`, 4, T, noun),
      ]);
    },
  },

  // ---- 5. Quick how-to -----------------------------------------------------------------------
  {
    id: 'howto', name: 'Quick how-to', emoji: '🛠️',
    blurb: 'A fast, useful tutorial — the most-saved format (saves boost reach).',
    sample: 'How to [EDIT] in 30 seconds',
    look: 'numbered steps, large on-screen text, brisk cuts',
    ideas: (topic, v) => makeIdeas('howto', [
      { key: 'fast', title: (T) => `How to ${T} in 30 seconds`, angle: (T) => `The fastest honest path to a ${T} result, in three steps.`,
        hooks: (T) => [`Here's how to ${T} in 30 seconds. Save this — you'll need it.`, `The fastest way to ${T}, step by step.`], why: 'Tight, saveable how-tos get bookmarked, and saves are a stronger reach signal than likes.' },
      { key: 'wrong', title: (T) => `You're doing ${T} wrong — do this`, angle: (T) => `The common wrong way to ${T}, then the right three steps.`,
        hooks: (T) => [`You're probably doing ${T} wrong. Here's the right way in three steps.`, `Stop doing ${T} the hard way. Do this instead.`], why: 'A “you\'re doing it wrong” hook creates a gap the three steps immediately close.' },
      { key: 'beginner', title: (T) => `${T} for total beginners`, angle: (T) => `The three-step starting point for someone brand new to ${T}.`,
        hooks: (T) => [`If you're brand new to ${T}, start with these three steps.`, `The beginner's guide to ${T} — no fluff.`], why: 'Beginner content has the widest possible audience and gets shared to friends starting out.' },
    ], topic, v),
    script: (idea, v) => {
      const T = idea.topic; const noun = 'step';
      return script('promise the outcome → three steps → the result → save + follow', [
        B('hook', 'Hook · 0–3s', 'Save this ✅', idea.hookLine, 3, T, noun),
        B('value', 'Step 1 · 3–9s', '1 · [EDIT]', `Step one: [EDIT: the first action — the one most people skip].`, 6, T, noun),
        B('value', 'Step 2 · 9–15s', '2 · [EDIT]', `Step two: [EDIT: the second action, kept concrete].`, 6, T, noun),
        B('escalation', 'Step 3 · 15–21s', '3 · [EDIT]', `Step three, the part that makes it actually work: [EDIT: the third action].`, 6, T, noun),
        B('peak', 'The result · 21–27s', 'Done ✅', `And that's it — [EDIT: the finished result you can now show on screen].`, 6, T, noun),
        B('cta', 'CTA · 27–31s', 'Save + follow', `Save this so you don't lose it — follow for more ${T} how-tos.`, 4, T, noun),
      ]);
    },
  },

  // ---- 6. Contrarian take --------------------------------------------------------------------
  {
    id: 'contrarian', name: '“Nobody talks about…”', emoji: '🤫',
    blurb: 'A contrarian take that sparks debate — engineered for the comments.',
    sample: 'Unpopular opinion about [EDIT]…',
    look: 'direct-to-camera energy, bold statement cards, punchy',
    ideas: (topic, v) => makeIdeas('contrarian', [
      { key: 'unpopular', title: (T) => `Unpopular opinion about ${T}`, angle: (T) => `A defensible contrarian claim about ${T}, then the reasoning.`,
        hooks: (T) => [`Unpopular opinion about ${T}: hear me out before you comment.`, `My hottest take on ${T} — and I can back it up.`], why: 'A stated “unpopular opinion” invites the disagree-camp to argue, driving comment volume.' },
      { key: 'nobody', title: (T) => `Nobody talks about this in ${T}`, angle: (T) => `The thing the ${T} space avoids saying out loud.`,
        hooks: (T) => [`Nobody in ${T} wants to say this out loud. So I will.`, `The ${T} take everyone thinks but won't post.`], why: '“Saying the quiet part” framing feels brave and gets shared as a proxy for the viewer\'s own view.' },
      { key: 'overrated', title: (T) => `${T} is overrated — here's why`, angle: (T) => `Argue that a sacred cow in ${T} is overrated, with a real reason.`,
        hooks: (T) => [`${T} is way more overrated than people admit. Here's the case.`, `Everyone loves this ${T} thing. It's overrated.`], why: 'Challenging something beloved guarantees a defense-camp and a nodding-camp — both comment.' },
    ], topic, v),
    script: (idea, v) => {
      const T = idea.topic; const noun = 'point';
      return script('bold claim → the take → the reasoning → the evidence → invite the debate', [
        B('hook', 'Hook · 0–3s', 'Unpopular opinion', idea.hookLine, 3, T, noun),
        B('value', 'The take · 3–10s', 'Hear me out', `Here's my take: [EDIT: the contrarian claim about ${T}]. I know that's not what you've been told.`, 7, T, noun),
        B('escalation', 'The reasoning · 10–18s', 'Here’s why', `The reason is simple: [EDIT: the core argument — one specific mechanism].`, 8, T, noun),
        B('peak', 'The evidence · 18–25s', 'The receipts', `And here's the proof: [EDIT: the evidence — a stat, an example, or a result].`, 7, T, noun),
        B('cta', 'CTA · 25–29s', 'Agree? 👇', `Agree, or think I'm wrong? Tell me in the comments — follow for more takes.`, 4, T, noun),
      ]);
    },
  },
];

// ---- the public API the studio UI drives -----------------------------------------------------

export const REEL_FORMATS: ReelFormat[] = FMT;

export function reelFormatById(id: string): ReelFormat | null {
  return REEL_FORMATS.find((f) => f.id === id) ?? null;
}

/** Stage 1: given a format + topic, the gallery of angle concepts. `variant` rotates the angles + hooks. */
export function reelIdeas(formatId: string, topic: string, variant = 0): ReelIdea[] {
  const f = reelFormatById(formatId);
  return f ? f.ideas(topic, variant) : [];
}

/** Stage 2: the chosen idea → a beat-by-beat script. `variant` is reserved for a re-write. */
export function reelScript(formatId: string, idea: ReelIdea, variant = 0): ReelScript | null {
  const f = reelFormatById(formatId);
  return f ? f.script(idea, variant) : null;
}

/** The role → cinematic-layer maps: how each beat cuts, moves, and feels. Shared so every reel is
 *  directed consistently; the beat's own subject/action carries the topic specificity. */
const ZONE: Record<SceneRole, ReelScene['zone']> = { hook: 'hook', value: 'setup', escalation: 'setup', peak: 'payoff', cta: 'payoff' };
const CAMERA: Record<SceneRole, string> = {
  hook: 'Snap-zoom / punch-in on the subject as the text slams on',
  value: 'Steady medium shot, slow push-in; let the caption breathe',
  escalation: 'Tighter framing, quicker energy; whip-pan or match-cut into the detail',
  peak: 'The reveal shot — pull-back or hero close-up, hold a beat',
  cta: 'Centered, still end card; subject settles behind the handle',
};
const MOOD: Record<SceneRole, string> = {
  hook: 'urgent, high-contrast, scroll-stopping',
  value: 'clear and confident',
  escalation: 'building momentum, a little tension',
  peak: 'satisfying — the “aha”',
  cta: 'warm, direct, inviting',
};
const CUT: Record<SceneRole, string> = {
  hook: 'hard cut in on the beat',
  value: 'hard cut',
  escalation: 'hard cut on the beat',
  peak: 'continuity hold — let it land',
  cta: 'hard cut to the end card',
};
const ENV_FLAVOR: Record<SceneRole, string> = {
  hook: 'opening frame, subject front and center',
  value: 'clean stage for the point',
  escalation: 'tighter, more dynamic composition',
  peak: 'the hero moment — the most striking composition',
  cta: 'simple end card with breathing room',
};

/** Stage 3: expand a script into fully-directed scenes — the shot list a video model would take. */
export function reelScenes(format: ReelFormat, script: ReelScript): ReelScene[] {
  return script.beats.map((b, i) => ({
    ...b,
    index: i,
    zone: ZONE[b.role],
    environment: `${format.look} · ${ENV_FLAVOR[b.role]}`,
    camera: CAMERA[b.role],
    mood: MOOD[b.role],
    cut: CUT[b.role],
  }));
}

/** The post caption + hashtags — a visible [EDIT] hole for the line, topic-seeded tags. */
export function reelCaption(topic: string, variant = 0): string {
  const T = topicOr(topic);
  const line = pick([
    `[EDIT: one line that restates your hook about ${T}]`,
    `[EDIT: a question about ${T} that makes people comment] 👇`,
  ], variant);
  const flavor = pick(['viral', 'learnontiktok', 'didyouknow', 'explained'], variant);
  return `${line}\n\n#${slug(T)} #fyp #shorts #reels #${flavor}`;
}

/** Compose the whole reel — idea, spine, script, staged scenes, caption — into a copy/save blob. */
export function reelToText(format: ReelFormat, idea: ReelIdea, script: ReelScript, scenes: ReelScene[], captionVariant = 0): string {
  const head = [
    `🎬 ${format.name} — ${idea.title}`,
    `Topic: ${idea.topic}`,
    `Angle: ${idea.angle}`,
    `Why it works: ${idea.whyItWorks}`,
    `Story spine: ${script.spine}`,
    `Format: 9:16 vertical · ~${script.runtime}s · ${format.look}`,
  ].join('\n');
  const body = scenes.map((s) => [
    `\nSCENE ${s.index + 1} · ${s.label}  (${s.seconds}s)`,
    `  On-screen: ${s.onscreen}`,
    `  VO: ${s.narration}`,
    `  Shot: ${s.subject} — ${s.action}`,
    `  Camera: ${s.camera}`,
    `  Environment: ${s.environment}`,
    `  Mood: ${s.mood} · Cut: ${s.cut}`,
  ].join('\n')).join('\n');
  return `${head}\n${body}\n\nPost caption:\n${reelCaption(idea.topic, captionVariant)}`;
}
