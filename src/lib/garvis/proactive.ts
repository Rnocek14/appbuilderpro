// src/lib/garvis/proactive.ts
// GARVIS SPEAKS UNPROMPTED — pure core (verified by proactive.verify.ts).
//
// The corner could answer anything and remembered everything, but it only ever spoke when
// spoken to. The machinery, meanwhile, runs while the operator is elsewhere: a standing order
// catches a competitor changing their pricing, an arc parks at a seam, an approval sits for
// three days blocking everything behind it. None of that reached them until they thought to ask.
//
// Now those become TURNS in the conversation (thread.ts) — Garvis's own lines, sitting where the
// operator already looks. Which makes the rules that keep it from becoming a notification
// firehose the entire design:
//
//   1. REAL ROWS ONLY. Every line names a thing that exists — a title, a reason, a count, a day.
//      A failed probe contributes nothing; there is no "you might want to check on things".
//   2. ONCE, EVER. Each observation carries a stable key. Said once, never again — no daily
//      re-nagging about the same approval.
//   3. WORTH INTERRUPTING FOR. Ranked, and only the top few per waking. A fresh approval is not
//      news; one that has been sitting for days is.
//   4. NO THEATER. No persona chatter, no "I've been busy", no hours-saved claims. If nothing
//      qualifies, Garvis says nothing — silence is a valid, honest report.

export interface Observation {
  /** Stable identity — the dedupe unit. Said once, ever. */
  key: string;
  /** The line Garvis says. Names the real thing; no hedging, no filler. */
  text: string;
  /** Higher speaks first. Blocking beats informational. */
  priority: number;
}

// Deliberately NOT carried: a tappable action. A volunteered line is a turn in the conversation,
// and a turn re-read from the record has no chip attached — so a chip here would vanish on the
// next load. What you see after a refresh must be what you saw when it arrived. The doors are a
// sentence away ("queue", "orchestrate") and the approvals chip already stands on its own.

/** Gathered rows. Every field may be null: a probe that failed contributes NOTHING, never a zero. */
export interface ProactiveFacts {
  /** ISO now — passed in so the core stays pure and testable. */
  now: string;
  /** Approvals still pending, with when they were raised. */
  approvals: { id: string; title: string; created_at: string }[] | null;
  /** Arcs parked at a seam right now. */
  waiting: { id: string; title: string; reason: string | null }[] | null;
  /** Arcs that finished, most recent first. */
  finished: { id: string; title: string; at: string }[] | null;
  /** Standing orders whose last run actually found something. */
  watches: { id: string; label: string; status: string; line: string; excerpt: string | null; at: string | null }[] | null;
  /** Opportunities filed and not yet looked at. */
  opportunities: { id: string; title: string; found_at: string }[] | null;
}

/** An approval younger than this is simply in flight; nagging about it would be noise. */
export const STALE_APPROVAL_DAYS = 2;
/** How far back a finished arc or a watch hit still counts as news. */
const NEWS_HOURS = 48;
/** Most lines Garvis will volunteer in one waking. The rest keep until next time. */
export const MAX_PER_WAKE = 2;

const days = (now: string, then: string): number => {
  const a = Date.parse(now);
  const b = Date.parse(then);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((a - b) / 86_400_000);
};
const hours = (now: string, then: string): number => {
  const a = Date.parse(now);
  const b = Date.parse(then);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return (a - b) / 3_600_000;
};
const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const short = (s: string, n = 80): string => (clean(s).length > n ? `${clean(s).slice(0, n - 1)}…` : clean(s));

/**
 * Turn the gathered rows into things worth saying, most important first. Deterministic: the same
 * facts always produce the same lines in the same order.
 */
export function observe(f: ProactiveFacts): Observation[] {
  const out: Observation[] = [];

  // BLOCKING — an approval that has been sitting is the one thing that stops everything behind
  // it. This is the only observation that earns top priority.
  for (const a of f.approvals ?? []) {
    const d = days(f.now, a.created_at);
    if (d < STALE_APPROVAL_DAYS) continue;
    out.push({
      key: `approval:${a.id}`,
      text: `“${short(a.title)}” has been waiting on your approval for ${d} days — nothing goes out until you decide.`,
      priority: 100 + d,
    });
  }

  // PARKED — Garvis started work and it stopped. The operator is owed the reason, in the reason's
  // own words; a seam with no recorded reason is stated as exactly that.
  for (const w of f.waiting ?? []) {
    out.push({
      key: `waiting:${w.id}`,
      text: `${short(w.title)} is parked: ${w.reason ? short(w.reason, 120) : 'a step needs you before it can go on'}.`,
      priority: 60,
    });
  }

  // FOUND — a standing order only reads and records; this is where what it read surfaces.
  for (const w of f.watches ?? []) {
    if (w.status !== 'changed') continue;              // unchanged and unreachable are not news
    if (!w.at || hours(f.now, w.at) > NEWS_HOURS) continue;
    out.push({
      key: `watch:${w.id}:${w.at}`,
      text: `${short(w.label)} changed${w.excerpt ? `: ${short(w.excerpt, 120)}` : '.'}`,
      priority: 50,
    });
  }

  // FINISHED — work that completed while they were elsewhere.
  for (const a of f.finished ?? []) {
    if (hours(f.now, a.at) > NEWS_HOURS) continue;
    out.push({ key: `done:${a.id}`, text: `${short(a.title)} finished.`, priority: 30 });
  }

  // FILED — a hunt found something. Named, never counted, so it can be deduped by identity.
  for (const o of f.opportunities ?? []) {
    if (hours(f.now, o.found_at) > NEWS_HOURS) continue;
    out.push({
      key: `opportunity:${o.id}`,
      text: `A hunt filed “${short(o.title)}”.`,
      priority: 20,
    });
  }

  return out.sort((a, b) => (b.priority - a.priority) || a.key.localeCompare(b.key));
}

/** Drop anything already said. The record of what was said is the caller's to keep. */
export function unspoken(obs: Observation[], spoken: string[]): Observation[] {
  const said = new Set(spoken);
  return obs.filter((o) => !said.has(o.key));
}

/** What to actually volunteer this waking: the most important few that have never been said. */
export function pickToSay(obs: Observation[], spoken: string[], max = MAX_PER_WAKE): Observation[] {
  return max <= 0 ? [] : unspoken(obs, spoken).slice(0, max);
}

/** The dock remounts on every navigation; looking for news that often would be five queries a
 *  page for nothing. This is how often it is worth actually looking. */
export const LOOK_GAP_MINUTES = 5;

/** Is it worth looking again? Never looked (null/unparseable) always is. */
export function isDue(lastLookAt: string | null, now: string, gapMinutes = LOOK_GAP_MINUTES): boolean {
  if (!lastLookAt) return true;
  const a = Date.parse(now);
  const b = Date.parse(lastLookAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return a - b >= gapMinutes * 60_000;
}

/** Fold newly-said keys into the record, newest kept, oldest forgotten past the cap. */
export function rememberSpoken(spoken: string[], keys: string[], cap = 200): string[] {
  const next = [...spoken.filter((k) => !keys.includes(k)), ...keys];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
