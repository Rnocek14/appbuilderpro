// src/lib/garvis/channelPulse.ts
// THE CHANNEL PULSE — pure core (verified by channelPulse.verify.ts). The multi-month instrument
// the walkthrough found missing: the whole strategy hangs on TIME (post consistently, expect
// inflection at days 45-75, then double down), but nothing on screen said where the operator was
// in that arc. This core turns the channel's own record into the coach line for the day the
// operator most wants to quit:
//   "Day 32 · posted 5 of the last 7 days · recent episodes at 1.4x your earlier baseline —
//    channels typically inflect days 45-75; consistency is the input that compounds."
// Honest by construction: the trend only speaks with ≥3 measured episodes on EACH side (never a
// verdict from noise), a never-posted channel says so plainly, and `nowIso` is an input — same
// inputs, same pulse. No new tables; everything derives from episodes + their posts' real dates.

export interface PulseEpisode {
  postedAt: string | null;   // the post's real posted_at (null = never made it out)
  views: number | null;      // measured reach (null = unmeasured, never a fake zero)
}

export interface ChannelPulse {
  dayN: number;                    // day 1 = the channel's creation day
  postedLast7: number;             // distinct days with a real post in the trailing 7
  lastPostDaysAgo: number | null;  // null = nothing has posted yet
  trend: number | null;            // median of recent measured ÷ median of the prior batch
  spark: number[];                 // last ≤14 measured views, chronological — the sparkline
  stats: string;                   // the numeric clause
  read: string;                    // the coach clause
}

const DAY_MS = 86_400_000;
const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export function channelPulse(channelCreatedAt: string, episodes: PulseEpisode[], nowIso: string): ChannelPulse {
  const now = Date.parse(nowIso);
  const created = Date.parse(channelCreatedAt);
  const dayN = Number.isFinite(now) && Number.isFinite(created)
    ? Math.max(1, Math.floor((now - created) / DAY_MS) + 1) : 1;

  const postedTimes = episodes
    .map((e) => (e.postedAt ? Date.parse(e.postedAt) : NaN))
    .filter((t) => Number.isFinite(t) && t <= now)
    .sort((a, b) => a - b);
  const postedLast7 = new Set(
    postedTimes.filter((t) => now - t < 7 * DAY_MS).map((t) => Math.floor(t / DAY_MS)),
  ).size;
  const lastPostDaysAgo = postedTimes.length
    ? Math.floor((now - postedTimes[postedTimes.length - 1]) / DAY_MS) : null;

  // Measured episodes in posting order; the trend compares the last 7 against the 7 before them.
  const measured = episodes
    .filter((e) => e.postedAt && e.views !== null && Number.isFinite(Date.parse(e.postedAt)))
    .sort((a, b) => Date.parse(a.postedAt!) - Date.parse(b.postedAt!))
    .map((e) => e.views as number);
  const recent = measured.slice(-7);
  const prior = measured.slice(0, -7).slice(-7);
  const priorMedian = prior.length >= 3 ? median(prior) : null;
  const trend = recent.length >= 3 && priorMedian !== null && priorMedian > 0
    ? Math.round((median(recent) / priorMedian) * 10) / 10 : null;
  const spark = measured.slice(-14);

  const stats = [
    `Day ${dayN}`,
    lastPostDaysAgo === null ? 'nothing posted yet' : `posted ${postedLast7} of the last 7 days`,
    ...(lastPostDaysAgo !== null && lastPostDaysAgo >= 3 ? [`last post ${lastPostDaysAgo} days ago`] : []),
    ...(trend !== null ? [`recent episodes at ${trend}x your earlier baseline`] : []),
  ].join(' · ');

  let read: string;
  if (lastPostDaysAgo === null) read = 'the clock starts when the first post goes out — draft, produce, approve';
  else if (dayN < 45) read = 'channels typically inflect days 45-75 — consistency is the input that compounds';
  else if (dayN <= 75) read = "you're inside the typical inflection window (days 45-75) — hold the cadence";
  else if (trend === null) read = 'past day 75 — not enough measured episodes to read a trend; keep posting and let metrics sync';
  else if (trend >= 1.2) read = 'past day 75 and trending up — the compounding phase; double down on winners';
  else read = 'past the typical window and flat — lean on the loop: B-cut the winners, retire the quiet mechanisms';

  return { dayN, postedLast7, lastPostDaysAgo, trend, spark, stats, read };
}
