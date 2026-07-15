// src/lib/garvis/copyStudio.ts
// THE COPY STUDIO — a gallery of messaging ideas (value prop, elevator pitch, origin story, objection
// handling, bio, taglines, differentiators, FAQ), each a ready, editable example. Same system + voice
// as the email + ads studios (studioKit). This is the "what do I even say about my business?" studio —
// the raw messaging every other channel reuses. Verified by copyStudio.verify.ts.
//
// HONESTY: examples are honest scaffolds from the facts we HAVE; anything specific (a real number, a
// real credential, the actual offer) is a visible [EDIT: …] hole. Nothing here is a claim until the
// owner fills and approves it.

import { type StudioCtx, type StudioIdea, type StudioSpec, type StudioExample, area, biz, pick, fillTokens } from './studioKit';

export interface CopyIdea extends StudioIdea {
  render: (ctx: StudioCtx, variant: number) => StudioExample;
}

const P = (label: string, value: string, multiline = true) => ({ label, value, multiline });
const who = (c: StudioCtx) => biz(c);
const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : '');

const IDEAS: CopyIdea[] = [
  {
    id: 'copy_value_prop', name: 'Value proposition', emoji: '💎', audience: 'both',
    blurb: 'The one line that says why someone should choose you.', sample: 'One line: why {biz}?', variants: 3,
    render: (c, v) => ({
      parts: [
        P('Use it', 'Homepage hero, email signature, social bio, the top of any pitch.', false),
        P('One-liner', pick([
          c.realEstate ? `Straight answers and real numbers for ${area(c)} home sellers — no pressure, ever.` : `${who(c)}: [EDIT: the outcome you deliver], without [EDIT: the usual pain].`,
          c.realEstate ? `The ${area(c)} agent who tells you the truth about your home’s value.` : `[EDIT: what you do] done right the first time — by people who actually care.`,
          `${who(c)} — [EDIT: your outcome] for [EDIT: who you help].`,
        ], v), false),
        P('Expanded', pick([
          `Most [EDIT: your customers] settle for [EDIT: the mediocre norm]. We don’t. ${who(c)} gives you [EDIT: your real difference] — so you get [EDIT: the outcome] without [EDIT: the headache].`,
          `Here’s the promise: [EDIT: what you guarantee]. No [EDIT: common frustration], no surprises. Just [EDIT: the result], every time.`,
        ], v)),
      ],
    }),
  },
  {
    id: 'copy_elevator', name: 'Elevator pitch', emoji: '🛗', audience: 'both',
    blurb: '30 seconds that explain what you do and who it’s for.', sample: '“So, what do you do?”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Use it', 'Networking, intros, the “what do you do?” moment, an About paragraph.', false),
        P('Pitch', pick([
          `I’m ${clean(c.agentName) || who(c)} with ${who(c)}. I help [EDIT: who — e.g. ${c.realEstate ? `${area(c)} homeowners` : 'busy local families'}] [EDIT: the outcome — e.g. ${c.realEstate ? 'sell for the most, with the least stress' : 'get X done right'}]. What makes it work is [EDIT: your one real difference]. If that’s ever useful to you or someone you know, I’d love to help.`,
          `You know how [EDIT: your customer] always struggle with [EDIT: the problem]? I fix that. I’m ${who(c)}, and I [EDIT: what you do] so they can [EDIT: the outcome]. Simple as that.`,
        ], v)),
      ],
    }),
  },
  {
    id: 'copy_story', name: 'Origin story', emoji: '📖', audience: 'both',
    blurb: 'Why you do this — the human reason people connect with.', sample: 'Why I started {biz}', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Use it', 'About page, a “meet the team” post, the P.S. of a nurture email.', false),
        P('Story', pick([
          `I started ${who(c)} because [EDIT: the real reason — a frustration you saw, a person you wanted to help]. Early on I learned [EDIT: the lesson that shaped how you work]. Today, that’s still the whole point: [EDIT: what you promise every client]. When you work with me, that’s what you get.`,
          `Here’s the honest version. [EDIT: a short true moment from your story]. That’s when I knew I wanted to do this differently — [EDIT: how you do it differently]. ${who(c)} has been that ever since.`,
        ], v)),
      ],
    }),
  },
  {
    id: 'copy_objection', name: 'Handle an objection', emoji: '🛑', audience: 'both',
    blurb: 'Answer the hesitation that stops people from saying yes.', sample: '“Is it worth it?”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('The objection', pick([
          c.realEstate ? '“Why not just sell it myself / use a discount agent?”' : '“Isn’t this too expensive / can’t I just do it myself?”',
          '“How do I know you’re any different from the rest?”',
        ], v), false),
        P('The answer', pick([
          c.realEstate
            ? `Totally fair question. Here’s the math: [EDIT: the real value you add — e.g. homes I list sell for X% more / X days faster]. That difference usually [EDIT: more than covers the cost / outweighs the DIY route]. And you get [EDIT: what you handle so they don’t]. Worst case, you get an honest opinion for free.`
            : `Fair to ask. The honest answer: [EDIT: the concrete value — time saved, mistakes avoided, result delivered]. Doing it yourself can work, but it usually costs [EDIT: the hidden cost]. With ${who(c)} you get [EDIT: what they get] — and if it’s not right for you, I’ll tell you.`,
          `I get it — everyone says they’re the best. So instead of claiming it: [EDIT: proof — a result, a guarantee, a review]. Talk to [EDIT: a past client] if you want. I’d rather earn it than promise it.`,
        ], v)),
      ],
    }),
  },
  {
    id: 'copy_differentiator', name: 'Why choose us (3 points)', emoji: '⭐', audience: 'both',
    blurb: 'Three concrete reasons to pick you over the alternative.', sample: 'Three reasons — {biz}', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Use it', 'Homepage, a “why us” section, a listing/consult presentation.', false),
        P('Three points', pick([
          `1. [EDIT: a real strength] — so you [EDIT: the benefit].\n2. [EDIT: a second strength] — which means [EDIT: the benefit].\n3. [EDIT: a third strength] — the part [EDIT: competitors skip].`,
          `• Local: ${area(c)} is home turf, not a territory. [EDIT: proof].\n• Honest: [EDIT: how you’re straight with people].\n• Proven: [EDIT: a result or number].`,
        ], v)),
      ],
    }),
  },
  {
    id: 'copy_bio', name: 'Bio / About blurb', emoji: '👤', audience: 'both',
    blurb: 'A short + a longer bio, ready for anywhere.', sample: 'About {biz}', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Short (1–2 lines)', pick([
          `${clean(c.agentName) || who(c)} — ${c.realEstate ? `a ${area(c)} real estate agent` : `${who(c)}`} who [EDIT: your one-line difference].`,
          `${who(c)}: [EDIT: what you do] for [EDIT: who], in ${area(c)}.`,
        ], v), false),
        P('Longer (a paragraph)', `${clean(c.agentName) || who(c)} helps [EDIT: who you serve] with [EDIT: what you do]. ${pick([`Known for [EDIT: your reputation],`, `With [EDIT: X years / a track record of Y],`], v)} ${clean(c.agentName) ? 'they' : 'we'} focus on [EDIT: what matters most to clients] — and it shows in [EDIT: the result / the reviews]. Based in ${area(c)}. [EDIT: a personal line — family, roots, what you love about the area].`),
      ],
    }),
  },
  {
    id: 'copy_taglines', name: 'Tagline options', emoji: '🏷️', audience: 'both',
    blurb: 'Five short taglines to pick from.', sample: 'Five taglines for {biz}', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Use it', 'Under your logo, in a bio, on a business card or sign.', false),
        P('Options', pick([
          c.realEstate
            ? `• ${area(c)}, done right.\n• Your home. Your number. The truth.\n• Local. Honest. Sold.\n• [EDIT: your name], [EDIT: your area]’s straight-talk agent.\n• Real estate without the runaround.`
            : `• ${who(c)} — [EDIT: your promise].\n• [EDIT: the outcome], the ${who(c)} way.\n• Local, and proud of it.\n• [EDIT: what you do], done right.\n• Small enough to care, good enough to trust.`,
          c.realEstate
            ? `• The agent who tells you the truth.\n• More for your home, less of the stress.\n• ${area(c)} is home — let’s keep it that way.\n• Listed, marketed, sold — by someone local.\n• [EDIT: your name]. On your side.`
            : `• [EDIT: benefit] you can count on.\n• Where ${area(c)} goes for [EDIT: your thing].\n• Better [EDIT: your thing]. Simple as that.\n• [EDIT: adjective] service, every time.\n• You deserve better than [EDIT: the norm].`,
        ], v)),
      ],
    }),
  },
  {
    id: 'copy_cta', name: 'Call-to-action lines', emoji: '👉', audience: 'both',
    blurb: 'Five ways to ask for the next step, without being pushy.', sample: 'Five CTAs to close warmly', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Use it', 'End of an email, a post, an ad, or a page.', false),
        P('Options', pick([
          c.realEstate
            ? `• Reply “number” and I’ll send your home’s value — free, no pressure.\n• Want a private tour? Just say when.\n• Curious what yours would sell for? I’ll tell you honestly.\n• Thinking about it? Let’s talk timing — no obligation.\n• Know someone buying or selling in ${area(c)}? I’d love an intro.`
            : `• Reply and I’ll take it from there.\n• Want the details? Just ask.\n• Ready when you are — no pressure.\n• Grab a spot: [EDIT: link].\n• Questions? Hit reply — a real person answers.`,
          `• [EDIT: the one action], and I’ll [EDIT: what happens next].\n• Not sure yet? Ask me anything.\n• Two minutes now saves you [EDIT: the pain later].\n• Here when you need me: [EDIT: how to reach you].\n• Prefer to talk? Call [EDIT: your phone].`,
        ], v)),
      ],
    }),
  },
  {
    id: 'copy_faq', name: 'FAQ answers', emoji: '❓', audience: 'both',
    blurb: 'Clear answers to the questions people actually ask.', sample: 'Answer the top 3 questions', variants: 1,
    render: (c) => ({
      parts: [
        P('Use it', 'FAQ page, a nurture email, or to pre-empt objections on a call.', false),
        P('Q&A', c.realEstate
          ? `Q: How much is my home worth?\nA: I’ll give you an honest, current number — real comps, your home’s actual features, no auto-estimate. [EDIT: how they get it].\n\nQ: What do you charge?\nA: [EDIT: your commission / fee, plainly]. Here’s what that covers: [EDIT: what you do].\n\nQ: How long will it take to sell?\nA: In ${area(c)} right now, homes are averaging [EDIT: X] days. Yours depends on [EDIT: the honest factors].`
          : `Q: How much does it cost?\nA: [EDIT: your pricing, plainly — no games]. Here’s what’s included: [EDIT: what they get].\n\nQ: How long does it take?\nA: [EDIT: honest timeline]. It depends on [EDIT: the factors].\n\nQ: What makes you different?\nA: [EDIT: the one true thing]. And if we’re not the right fit, I’ll say so.`),
      ],
    }),
  },
];

export const COPY_IDEAS: CopyIdea[] = IDEAS;
export function copyIdeasFor(_realEstate: boolean): CopyIdea[] { return COPY_IDEAS; }  // all apply to any business
export function copyById(id: string): CopyIdea | null { return COPY_IDEAS.find((k) => k.id === id) ?? null; }

export function buildCopyExample(id: string, ctx: StudioCtx, variant = 0): StudioExample | null {
  const k = copyById(id);
  if (!k) return null;
  const ex = k.render(ctx, variant);
  return { parts: ex.parts.map((p) => ({ ...p, value: fillTokens(p.value, ctx) })) };
}

export const COPY_SPEC: StudioSpec = {
  kind: 'copy', emoji: '✍️', title: 'Copy studio',
  subtitle: 'Pick what you need to say — each opens a ready draft you can spin, edit, and save. This is the messaging every other channel reuses.',
  savePrefix: 'Copy',
  ideasFor: copyIdeasFor,
  sampleFor: (k, ctx) => fillTokens(k.sample, ctx),
  build: buildCopyExample,
};
