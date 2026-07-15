// src/lib/garvis/socialStudio.ts
// THE SOCIAL STUDIO — a gallery of post ideas (what to actually post), each a ready, editable draft:
// caption + hashtags + a note on where/when it lands best. Same system + voice as the email/ads/copy
// studios (studioKit). It sits ABOVE the publisher: pick an idea → a real draft → save it, then
// schedule/post it from the publisher. Verified by studioSuite.verify.ts.
//
// HONESTY: examples are starting drafts from the facts we HAVE; anything specific (a real photo, a
// real number, the actual detail) is a visible [EDIT: …] hole. Nothing posts from here.

import { type StudioCtx, type StudioIdea, type StudioSpec, type StudioExample, area, biz, pick, fillTokens } from './studioKit';

export interface SocialIdea extends StudioIdea {
  render: (ctx: StudioCtx, variant: number) => StudioExample;
}

const P = (label: string, value: string, multiline = true) => ({ label, value, multiline });
const bestFor = (s: string) => ({ label: 'Best for', value: s, multiline: false });

// ---- real-estate post ideas ----------------------------------------------------------------
const RE: SocialIdea[] = [
  {
    id: 'soc_new_listing', name: 'Just listed', emoji: '🏡', audience: 'realestate',
    blurb: 'Show off a new listing with a photo carousel.', sample: '“JUST LISTED in {area} 🏡”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `JUST LISTED in ${area(c)} 🏡\n\n[EDIT: address] — [EDIT: beds] bed / [EDIT: baths] bath, [EDIT: price].\n\nWhat makes it special: [EDIT: the one standout — the view, the kitchen, the lot].\n\nDM me or tap the link for a private tour. 📸 Swipe for photos →`,
          `New on the market 🚨 ${area(c)}\n\n[EDIT: a one-line hook about the home].\n\n📍 [EDIT: address]\n💰 [EDIT: price]\n🛏️ [EDIT: beds] bed · 🛁 [EDIT: baths] bath\n\nWho do you know that would love this? Tag them 👇`,
        ], v)),
        P('Hashtags', `#${area(c).replace(/[^A-Za-z]/g, '')}RealEstate #JustListed #HomeForSale #[EDIT: neighborhood] #RealEstate`, false),
        bestFor('Instagram + Facebook · a photo carousel (5–8 photos). Post mid-morning or early evening.'),
      ],
    }),
  },
  {
    id: 'soc_just_sold', name: 'Just sold', emoji: '✅', audience: 'realestate',
    blurb: 'Celebrate a sale — quiet social proof that pulls sellers.', sample: '“SOLD in {area} 🎉”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `SOLD in ${area(c)} 🎉\n\nAnother happy [EDIT: seller/buyer]! This one [EDIT: sold over asking / in X days / detail].\n\nThinking about making a move? The ${area(c)} market is [EDIT: honest one-liner]. DM me “value” for a free, no-pressure number on your home.`,
          `Just closed 🔑 Congrats to [EDIT: first name / “my wonderful clients”]!\n\nThe ${area(c)} market is [EDIT: one honest one-liner]. If you’ve ever wondered what yours is worth today, I’ll tell you honestly — no obligation. Comment 🏡 below.`,
        ], v)),
        P('Hashtags', `#JustSold #${area(c).replace(/[^A-Za-z]/g, '')}RealEstate #HomeSold #RealEstate #ThankYou`, false),
        bestFor('Instagram + Facebook · the sold photo or a “SOLD” sign graphic. Great as a Story too.'),
      ],
    }),
  },
  {
    id: 'soc_open_house', name: 'Open house', emoji: '📅', audience: 'realestate',
    blurb: 'Fill the open house — invite followers and their friends.', sample: '“OPEN HOUSE this [EDIT: day] 👋”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `OPEN HOUSE this [EDIT: day] 👋\n\n📍 [EDIT: address], ${area(c)}\n🕐 [EDIT: time]\n\n[EDIT: one line on the home]. Stop by, grab a coffee, take a look — no pressure. Bring a friend who’s house-hunting!`,
          `You’re invited 🏡 Open house [EDIT: day/time] in ${area(c)}.\n\nCome see [EDIT: the standout feature] in person. Can’t make it? DM me and I’ll set up a private time.`,
        ], v)),
        P('Hashtags', `#OpenHouse #${area(c).replace(/[^A-Za-z]/g, '')} #HouseHunting #RealEstate`, false),
        bestFor('Facebook event + Instagram Story with a “Remind me” sticker. Post 2–3 days before.'),
      ],
    }),
  },
  {
    id: 'soc_market_tip', name: 'Market tip', emoji: '📊', audience: 'realestate',
    blurb: 'Be the helpful local expert — a quick, useful insight.', sample: '“One thing {area} buyers get wrong…”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `Quick ${area(c)} market update 📊\n\n• Homes are selling in about [EDIT: X] days\n• Prices are [EDIT: up/down/flat]\n• What I’m watching: [EDIT: one real thing]\n\nThinking of buying or selling this year? Drop a 🏡 and I’ll DM you my honest read for your situation.`,
          `One thing a lot of ${area(c)} [EDIT: buyers/sellers] get wrong 👇\n\n[EDIT: the myth].\n\nHere’s the truth: [EDIT: the honest correction]. Save this for later — and DM me if you want the specifics for your home.`,
        ], v)),
        P('Hashtags', `#${area(c).replace(/[^A-Za-z]/g, '')}RealEstate #MarketUpdate #RealEstateTips #HomeBuying`, false),
        bestFor('Instagram/Facebook · a simple text-on-brand graphic or a talking-head Reel.'),
      ],
    }),
  },
  {
    id: 'soc_testimonial', name: 'Client love', emoji: '💬', audience: 'realestate',
    blurb: 'Let a happy client do the selling for you.', sample: '“What my clients say 💬”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `This is why I do what I do 💛\n\n“[EDIT: paste a real review from a client]”\n\nThank you, [EDIT: first name]! Helping people [EDIT: buy/sell] in ${area(c)} is the best job there is. Who’s next? 🏡`,
          `Client love 💬\n\n“[EDIT: a real testimonial]”\n\nNothing means more than a happy client. If you’re thinking about a move in ${area(c)}, I’d love to help you feel the same way.`,
        ], v)),
        P('Hashtags', `#ClientLove #Testimonial #${area(c).replace(/[^A-Za-z]/g, '')}RealEstate #ThankYou`, false),
        bestFor('Instagram + Facebook · a clean review-quote graphic. Only ever use real reviews.'),
      ],
    }),
  },
  {
    id: 'soc_bts', name: 'Behind the scenes', emoji: '🎬', audience: 'realestate',
    blurb: 'Show the human behind the sign — builds trust + reach.', sample: '“A day in the life 🎬”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `A little behind the scenes 🎬\n\nToday: [EDIT: what you actually did — a showing, a closing, prepping a listing]. People think real estate is [EDIT: the myth], but really it’s [EDIT: the honest reality].\n\nIt’s a lot of work — and I love it. 🏡`,
          `The part of this job nobody sees 👀\n\n[EDIT: a real, small, human moment from your week]. This is why local matters — I’m not a call center, I’m your neighbor in ${area(c)}.`,
        ], v)),
        P('Hashtags', `#BehindTheScenes #DayInTheLife #RealtorLife #${area(c).replace(/[^A-Za-z]/g, '')}`, false),
        bestFor('Instagram Reel or Story — casual, phone-shot, authentic beats polished here.'),
      ],
    }),
  },
];

// ---- general-business post ideas -----------------------------------------------------------
const GEN: SocialIdea[] = [
  {
    id: 'soc_announcement', name: 'Announcement', emoji: '📣', audience: 'general',
    blurb: 'Share news your followers will care about.', sample: '“Big news from {biz} 📣”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `Big news from ${biz(c)} 📣\n\n[EDIT: what’s new, in a line or two].\n\nWhy it’s good for you: [EDIT: the benefit]. Details 👉 [EDIT: link / DM us].`,
          `We’ve been working on something 👀\n\n[EDIT: the announcement]. We’re a little excited. Drop a 🎉 if you are too!`,
        ], v)),
        P('Hashtags', `#${biz(c).replace(/[^A-Za-z]/g, '')} #${area(c).replace(/[^A-Za-z]/g, '')} #News #[EDIT: your industry]`, false),
        bestFor('Instagram + Facebook · a bold graphic or a short Reel. Pin it for a few days.'),
      ],
    }),
  },
  {
    id: 'soc_offer', name: 'Offer / promo', emoji: '🏷️', audience: 'general',
    blurb: 'Drive action with a time-boxed deal.', sample: '“This week only 🏷️”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `This week only 🏷️\n\n[EDIT: the offer]. Through [EDIT: end date].\n\nNo catch — just a thank-you to our ${area(c)} regulars. Comment or DM “yes” to grab it. 👇`,
          `We don’t do this often 👀\n\n👉 [EDIT: the offer]\n📅 Ends [EDIT: date]\n\nTag someone who needs this. First come, first served!`,
        ], v)),
        P('Hashtags', `#Deal #${area(c).replace(/[^A-Za-z]/g, '')} #${biz(c).replace(/[^A-Za-z]/g, '')} #LimitedTime`, false),
        bestFor('Instagram Story (with a countdown sticker) + feed post. Post morning-of.'),
      ],
    }),
  },
  {
    id: 'soc_tip', name: 'Helpful tip', emoji: '💡', audience: 'general',
    blurb: 'Teach something small — the most shareable kind of post.', sample: '“One tip that saves you [EDIT] 💡”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `Quick tip 💡\n\n[EDIT: one genuinely useful tip your customers care about].\n\nSave this for later 🔖 — and if you want help with [EDIT: your thing], you know where we are.`,
          `The #1 mistake we see with [EDIT: your area] 👇\n\n[EDIT: the mistake]. Instead: [EDIT: the fix]. Simple, and it makes a big difference.`,
        ], v)),
        P('Hashtags', `#Tips #[EDIT: your industry] #${area(c).replace(/[^A-Za-z]/g, '')} #HowTo`, false),
        bestFor('Instagram Reel or carousel — “tips” posts get saved + shared, which grows reach.'),
      ],
    }),
  },
  {
    id: 'soc_testimonial_gen', name: 'Customer love', emoji: '💬', audience: 'general',
    blurb: 'Let a happy customer speak for you.', sample: '“What our customers say 💬”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `Made our week 💛\n\n“[EDIT: paste a real review]”\n\nThank you, [EDIT: name]! Reviews like this are why we do what we do at ${biz(c)}.`,
          `Customer love 💬\n\n“[EDIT: a real testimonial]”\n\nWe’re grateful for every one of you. 🙏`,
        ], v)),
        P('Hashtags', `#CustomerLove #Testimonial #${biz(c).replace(/[^A-Za-z]/g, '')} #ThankYou`, false),
        bestFor('Feed post with a quote graphic. Only ever use real reviews.'),
      ],
    }),
  },
  {
    id: 'soc_bts_gen', name: 'Behind the scenes', emoji: '🎬', audience: 'general',
    blurb: 'Show the people + care behind the business.', sample: '“Behind the scenes at {biz} 🎬”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          `Behind the scenes at ${biz(c)} 🎬\n\n[EDIT: what you were doing — making, prepping, serving]. This is the part people don’t see — and it’s where the quality comes from.`,
          `Meet the team 👋\n\n[EDIT: a quick intro to someone — name + one human detail]. The reason ${biz(c)} feels different is the people. Say hi 👇`,
        ], v)),
        P('Hashtags', `#BehindTheScenes #MeetTheTeam #${biz(c).replace(/[^A-Za-z]/g, '')} #Local`, false),
        bestFor('Instagram Reel or Story — casual + real outperforms polished here.'),
      ],
    }),
  },
  {
    id: 'soc_engage', name: 'Ask a question', emoji: '❓', audience: 'both',
    blurb: 'Spark comments — the algorithm rewards conversation.', sample: '“This or that? 👇”', variants: 2,
    render: (c, v) => ({
      parts: [
        P('Post', pick([
          c.realEstate
            ? `Would you rather? 🤔\n\n🏡 [EDIT: option A — e.g. lake view] OR 🌳 [EDIT: option B — e.g. big yard]\n\nDrop your pick below 👇 (No wrong answers — but it tells me a lot about your dream home!)`
            : `Quick question for you 🤔\n\n[EDIT: a fun, easy question your customers would answer — “coffee or tea?”, “this or that?”].\n\nComment below — genuinely curious! 👇`,
          `Fill in the blank 📝\n\n“The one thing I wish I knew before [EDIT: relevant topic] was ______.”\n\nComment yours — I read every one.`,
        ], v)),
        P('Hashtags', `#${area(c).replace(/[^A-Za-z]/g, '')} #Community #[EDIT: your topic]`, false),
        bestFor('Any platform · easy, low-effort engagement. Use an Instagram poll sticker in Stories.'),
      ],
    }),
  },
];

export const SOCIAL_IDEAS: SocialIdea[] = [...RE, ...GEN];

export function socialIdeasFor(realEstate: boolean): SocialIdea[] {
  return SOCIAL_IDEAS.filter((k) => k.audience === 'both' || k.audience === (realEstate ? 'realestate' : 'general'));
}
export function socialById(id: string): SocialIdea | null { return SOCIAL_IDEAS.find((k) => k.id === id) ?? null; }

export function buildSocialExample(id: string, ctx: StudioCtx, variant = 0): StudioExample | null {
  const k = socialById(id);
  if (!k) return null;
  const ex = k.render(ctx, variant);
  return { parts: ex.parts.map((p) => ({ ...p, value: fillTokens(p.value, ctx) })) };
}

export const SOCIAL_SPEC: StudioSpec = {
  kind: 'social', emoji: '📱', title: 'Social studio',
  subtitle: 'Pick a post idea — each opens a ready caption you can spin, edit, and save. Then schedule or post it from the publisher below.',
  savePrefix: 'Post',
  ideasFor: socialIdeasFor,
  sampleFor: (k, ctx) => fillTokens(k.sample, ctx),
  build: buildSocialExample,
};
