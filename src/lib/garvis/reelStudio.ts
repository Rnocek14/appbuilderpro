// src/lib/garvis/reelStudio.ts
// THE REEL STUDIO — a gallery of short-video FORMATS for a faceless content account (the content_growth
// world), each a ready, editable storyboard: a hook, a few scenes (shot prompt + on-screen caption +
// voiceover line), and a post caption. Same system + voice as the other studios (studioKit): pick a
// format → a worked storyboard → spin a different angle → edit → save as a draft. Verified by
// studioSuite.verify.ts.
//
// HONESTY: these are FORMAT templates. The niche topic/facts are yours to fill — every specific is a
// visible [EDIT: …] hole, never invented. And a storyboard is a SEED: turning it into a real vertical
// video needs a connected video model (the clip engine) — this studio never fakes finished footage.

import { type StudioCtx, type StudioIdea, type StudioSpec, type StudioExample, pick } from './studioKit';

export interface ReelIdea extends StudioIdea {
  render: (ctx: StudioCtx, variant: number) => StudioExample;
}

const P = (label: string, value: string) => ({ label, value, multiline: true });

/** One scene as an editable block: the shot to generate, the on-screen caption, the voiceover line. */
const scene = (shot: string, caption: string, vo: string) =>
  `🎬 Shot: ${shot}\n💬 Caption: ${caption}\n🎙️ VO: ${vo}`;

const CAPTION = (v: number) => P('Post caption + hashtags', pick([
  `[EDIT: one-line caption that restates the hook]\n\n#[EDIT: niche] #fyp #[EDIT: subtopic] #shorts #reels`,
  `[EDIT: a question that invites a comment] 👇\n\n#[EDIT: niche] #fyp #viral #[EDIT: subtopic] #shorts`,
], v));

const FORMAT = (extra = '') => ({ label: 'Format', value: `9:16 vertical · 20–35s · fast cuts on the beat · bold captions, high contrast${extra ? ` · ${extra}` : ''}`, multiline: false });

const IDEAS: ReelIdea[] = [
  {
    id: 'reel_did_you_know', name: '“Did you know?” fact drop', emoji: '🤯', audience: 'both',
    blurb: 'A surprising fact that stops the scroll — the highest-retention faceless format.', sample: '“You’ve been [EDIT] wrong your whole life…”', variants: 2,
    render: (_c, v) => ({
      parts: [
        P('Hook (0–3s)', pick([
          `Text on screen: "You've been [EDIT: doing X] wrong your whole life."\n🎙️ VO: "Did you know [EDIT: the surprising fact]?"`,
          `Text on screen: "99% of people don't know this about [EDIT: topic]."\n🎙️ VO: "Here's something almost nobody knows..."`,
        ], v)),
        P('Scene 2', scene('[EDIT: b-roll or AI visual of the subject]', 'Here’s the truth 👇', 'It turns out [EDIT: the explanation, part 1].')),
        P('Scene 3', scene('[EDIT: a contrasting or reveal visual]', '[EDIT: the surprising detail]', 'And [EDIT: the payoff / why it matters].')),
        P('Scene 4 (CTA)', scene('[EDIT: a calm end visual]', 'Follow for more 🧠', 'Follow for a new one every day.')),
        CAPTION(v),
        FORMAT('one clear on-screen fact per scene'),
      ],
    }),
  },
  {
    id: 'reel_top5', name: '“Top 5” countdown', emoji: '🔢', audience: 'both',
    blurb: 'A ranked list — endlessly rewatchable and easy to batch.', sample: '“Top 5 [EDIT] that will blow your mind”', variants: 2,
    render: (_c, v) => ({
      parts: [
        P('Hook (0–3s)', pick([
          `Text: "Top 5 [EDIT: things] that will blow your mind."\n🎙️ VO: "Number 1 is going to surprise you."`,
          `Text: "5 [EDIT: topic] facts they never taught you."\n🎙️ VO: "Save this before it's gone."`,
        ], v)),
        P('Scenes 5→2', `#5 — 🎬 [EDIT: visual] · 💬 "[EDIT: item 5]" · 🎙️ "[EDIT: one line]"\n#4 — 🎬 [EDIT: visual] · 💬 "[EDIT: item 4]" · 🎙️ "[EDIT: one line]"\n#3 — 🎬 [EDIT: visual] · 💬 "[EDIT: item 3]" · 🎙️ "[EDIT: one line]"\n#2 — 🎬 [EDIT: visual] · 💬 "[EDIT: item 2]" · 🎙️ "[EDIT: one line]"`),
        P('#1 (the payoff)', scene('[EDIT: the most striking visual]', '#1 — [EDIT: the best item]', 'And number one… [EDIT: the mic-drop line].')),
        P('CTA', scene('[EDIT: end card]', 'Which one shocked you? 👇', 'Comment your favorite — follow for part 2.')),
        CAPTION(v),
        FORMAT('number badge in the corner each scene'),
      ],
    }),
  },
  {
    id: 'reel_story', name: 'Mini-story', emoji: '📖', audience: 'both',
    blurb: 'A 30-second story with a twist — builds watch-through + shares.', sample: '“The [EDIT] story nobody tells you”', variants: 2,
    render: (_c, v) => ({
      parts: [
        P('Hook (0–3s)', pick([
          `Text: "The [EDIT: person/thing] story nobody tells you."\n🎙️ VO: "In [EDIT: year/place], something happened that changed everything."`,
          `Text: "This is the craziest [EDIT: topic] story ever."\n🎙️ VO: "It started with [EDIT: the setup]..."`,
        ], v)),
        P('Scene 2 (rising)', scene('[EDIT: atmospheric visual of the setup]', '[EDIT: what happened next]', 'Then [EDIT: the escalation].')),
        P('Scene 3 (twist)', scene('[EDIT: the turning-point visual]', 'But then… 😳', 'But nobody expected [EDIT: the twist].')),
        P('Scene 4 (payoff)', scene('[EDIT: the resolution visual]', '[EDIT: the lesson]', 'And that’s why [EDIT: the takeaway].')),
        CAPTION(v),
        FORMAT('slower cuts, cinematic'),
      ],
    }),
  },
  {
    id: 'reel_myth', name: 'Myth vs. reality', emoji: '⚖️', audience: 'both',
    blurb: 'Bust a common misconception — great for comments + duets.', sample: '“Everything you know about [EDIT] is wrong”', variants: 2,
    render: (_c, v) => ({
      parts: [
        P('Hook (0–3s)', pick([
          `Text: "MYTH: [EDIT: the common belief]."\n🎙️ VO: "Almost everyone believes this. It's wrong."`,
          `Text: "Stop believing this about [EDIT: topic]."\n🎙️ VO: "This myth needs to die."`,
        ], v)),
        P('Scene 2 (the myth)', scene('[EDIT: visual illustrating the myth]', 'What everyone thinks:', 'People think [EDIT: the myth].')),
        P('Scene 3 (the reality)', scene('[EDIT: contrasting visual]', 'The reality:', 'But actually [EDIT: the truth] — because [EDIT: the reason].')),
        P('CTA', scene('[EDIT: end card]', 'Did you believe it too? 👇', 'Follow — I bust one myth a day.')),
        CAPTION(v),
        FORMAT('split-screen myth/reality look'),
      ],
    }),
  },
  {
    id: 'reel_pov', name: '“POV:” scenario', emoji: '🎭', audience: 'both',
    blurb: 'An immersive first-person moment — the native short-form format.', sample: '“POV: you just discovered [EDIT]”', variants: 2,
    render: (_c, v) => ({
      parts: [
        P('Hook (0–3s)', pick([
          `Text: "POV: you just found out [EDIT: the surprising thing]."\n🎙️ VO: (ambient / trending audio)`,
          `Text: "POV: it's [EDIT: time/place] and [EDIT: the scenario]."\n🎙️ VO: (trending audio)`,
        ], v)),
        P('Scene 2', scene('[EDIT: first-person visual of the moment]', '[EDIT: the caption beat]', '[EDIT: VO or leave for audio]')),
        P('Scene 3', scene('[EDIT: the reaction / escalation visual]', '[EDIT: the next beat]', '[EDIT: VO or leave for audio]')),
        P('Scene 4 (button)', scene('[EDIT: the payoff visual]', '[EDIT: the punchline]', '[EDIT: the closing line]')),
        CAPTION(v),
        FORMAT('lean on a trending audio; captions carry the story'),
      ],
    }),
  },
  {
    id: 'reel_how_to', name: 'Quick how-to', emoji: '🛠️', audience: 'both',
    blurb: 'A fast, useful tutorial — the most-saved format (saves boost reach).', sample: '“How to [EDIT] in 30 seconds”', variants: 2,
    render: (_c, v) => ({
      parts: [
        P('Hook (0–3s)', pick([
          `Text: "How to [EDIT: outcome] in 30 seconds."\n🎙️ VO: "Save this — you'll need it."`,
          `Text: "The fastest way to [EDIT: outcome]."\n🎙️ VO: "Step one is the one everyone skips."`,
        ], v)),
        P('Steps', `Step 1 — 🎬 [EDIT: visual] · 💬 "[EDIT: step 1]" · 🎙️ "[EDIT: say it]"\nStep 2 — 🎬 [EDIT: visual] · 💬 "[EDIT: step 2]" · 🎙️ "[EDIT: say it]"\nStep 3 — 🎬 [EDIT: visual] · 💬 "[EDIT: step 3]" · 🎙️ "[EDIT: say it]"`),
        P('Result + CTA', scene('[EDIT: the finished result]', 'Done ✅ Save this!', 'That’s it. Follow for more [EDIT: niche] tips.')),
        CAPTION(v),
        FORMAT('numbered steps, on-screen text large'),
      ],
    }),
  },
  {
    id: 'reel_contrarian', name: '“Nobody talks about…”', emoji: '🤫', audience: 'both',
    blurb: 'A contrarian take that sparks debate in the comments.', sample: '“Nobody talks about this [EDIT]”', variants: 2,
    render: (_c, v) => ({
      parts: [
        P('Hook (0–3s)', pick([
          `Text: "Nobody talks about this about [EDIT: topic]."\n🎙️ VO: "This is going to be controversial."`,
          `Text: "Unpopular opinion about [EDIT: topic]:"\n🎙️ VO: "Hear me out before you comment."`,
        ], v)),
        P('Scene 2 (the take)', scene('[EDIT: a bold visual]', '[EDIT: the contrarian claim]', 'Here’s the thing: [EDIT: your claim].')),
        P('Scene 3 (the why)', scene('[EDIT: supporting visual]', '[EDIT: the reason]', 'Because [EDIT: the argument]. And [EDIT: the evidence].')),
        P('CTA', scene('[EDIT: end card]', 'Agree or disagree? 👇', 'Tell me I’m wrong in the comments.')),
        CAPTION(v),
        FORMAT('direct-address energy'),
      ],
    }),
  },
  {
    id: 'reel_comparison', name: '“This vs. that”', emoji: '🆚', audience: 'both',
    blurb: 'A head-to-head comparison — simple, visual, and shareable.', sample: '“[EDIT] vs [EDIT] — which wins?”', variants: 2,
    render: (_c, v) => ({
      parts: [
        P('Hook (0–3s)', pick([
          `Text: "[EDIT: option A] vs [EDIT: option B] — which actually wins?"\n🎙️ VO: "The answer might surprise you."`,
          `Text: "Everyone picks [EDIT: A]. They’re wrong."\n🎙️ VO: "Let’s settle this."`,
        ], v)),
        P('Round-by-round', `Round 1 — 🎬 split screen · 💬 "[EDIT: criterion 1]: [winner]" · 🎙️ "[EDIT: why]"\nRound 2 — 🎬 split screen · 💬 "[EDIT: criterion 2]: [winner]" · 🎙️ "[EDIT: why]"\nRound 3 — 🎬 split screen · 💬 "[EDIT: criterion 3]: [winner]" · 🎙️ "[EDIT: why]"`),
        P('Verdict + CTA', scene('[EDIT: the winner highlighted]', 'Winner: [EDIT] 🏆', 'The winner is [EDIT] — but comment if you disagree.')),
        CAPTION(v),
        FORMAT('split-screen throughout, scoreboard'),
      ],
    }),
  },
];

export const REEL_IDEAS: ReelIdea[] = IDEAS;
export function reelIdeasFor(_realEstate: boolean): ReelIdea[] { return REEL_IDEAS; }  // formats fit any niche
export function reelById(id: string): ReelIdea | null { return REEL_IDEAS.find((k) => k.id === id) ?? null; }

export function buildReelExample(id: string, ctx: StudioCtx, variant = 0): StudioExample | null {
  const k = reelById(id);
  if (!k) return null;
  return k.render(ctx, variant);
}

export const REEL_SPEC: StudioSpec = {
  kind: 'reel', emoji: '🎬', title: 'Reel studio',
  subtitle: 'Pick a short-video format — each opens a ready storyboard (hook, scenes, captions, voiceover) you can spin, edit, and save. Rendering to video needs a connected video model.',
  savePrefix: 'Reel',
  ideasFor: reelIdeasFor,
  sampleFor: (k) => k.sample.replace(/\{[^}]+\}/g, ''),
  build: buildReelExample,
};
