// src/lib/garvis/briefing.ts
// THE BRIEFING — pure core (verified by briefing.verify.ts). The JARVIS trait the dock was
// missing: Garvis SPEAKS FIRST. The standing machinery works while the operator is away —
// episodes draft, hunts file opportunities, arcs finish or park at seams, approvals stack —
// and until now nothing reported back. composeBriefing turns the gathered facts into the
// morning report: what happened since the last look, what waits on the operator, what is
// running right now.
//
// Honesty rules (the same spine as everywhere else):
//   - A section only appears when its facts are REAL. A failed probe is null → honest silence
//     for that section, never a fake zero.
//   - Nothing is invented, no hype, no hours-saved claims — counts and titles from real rows.
//   - Quiet is stated as quiet: "nothing new, nothing waiting" is a valid, useful report.

export interface BriefingFacts {
  /** Local hour 0-23 (passed in — the core stays pure and testable). */
  hour: number;
  /** Hours since the operator's last look (drives the "since" phrasing). */
  sinceHours: number;
  /** Episodes drafted since the last look. Null = probe failed (say nothing about episodes). */
  episodes: { channel: string; title: string }[] | null;
  /** Opportunities filed since the last look. Null = probe failed. */
  opportunities: number | null;
  /** Arc titles that FINISHED since the last look. Null = probe failed. */
  arcsFinished: string[] | null;
  /** Arcs parked at a seam right now (not just recent ones). Null = probe failed. */
  arcsWaiting: { title: string; reason: string }[] | null;
  /** Approvals pending right now. Null = probe failed. */
  approvals: number | null;
  /** Standing orders armed right now. Null = probe failed. */
  clocks: number | null;
  /** Live channels. Null = probe failed. */
  channels: number | null;
}

export interface Briefing {
  /** One spoken sentence — salutation + the single most important fact. */
  headline: string;
  /** The report body, one real item per line. Empty on a fully-quiet, fully-unknown day. */
  lines: string[];
  /** True when nothing happened AND nothing waits — the quiet is itself the report. */
  quiet: boolean;
}

const salute = (hour: number): string => (hour < 5 ? 'Late one.' : hour < 12 ? 'Morning.' : hour < 18 ? 'Afternoon.' : 'Evening.');

const sinceLabel = (h: number): string => (h <= 18 ? 'since your last look' : h <= 48 ? 'since yesterday' : `these ${Math.max(2, Math.round(h / 24))} days`);

export function composeBriefing(f: BriefingFacts): Briefing {
  const lines: string[] = [];
  const since = sinceLabel(f.sinceHours);

  if (f.episodes && f.episodes.length > 0) {
    const shown = f.episodes.slice(0, 3).map((e) => `“${e.title}” (${e.channel})`).join(', ');
    const more = f.episodes.length > 3 ? ` +${f.episodes.length - 3} more` : '';
    lines.push(`${f.episodes.length} episode${f.episodes.length === 1 ? '' : 's'} drafted ${since}: ${shown}${more} — review in the studios.`);
  }
  if (f.opportunities !== null && f.opportunities > 0) {
    lines.push(`${f.opportunities} opportunit${f.opportunities === 1 ? 'y' : 'ies'} filed in the feed ${since} — triage when ready.`);
  }
  if (f.arcsFinished && f.arcsFinished.length > 0) {
    lines.push(`Finished ${since}: ${f.arcsFinished.slice(0, 3).map((t) => `“${t}”`).join(', ')}${f.arcsFinished.length > 3 ? ` +${f.arcsFinished.length - 3} more` : ''}.`);
  }
  for (const a of (f.arcsWaiting ?? []).slice(0, 3)) {
    lines.push(`Arc parked: “${a.title}” — ${a.reason}`);
  }
  if (f.approvals !== null && f.approvals > 0) {
    lines.push(`${f.approvals} approval${f.approvals === 1 ? '' : 's'} waiting in your Queue.`);
  }
  const running: string[] = [];
  if (f.clocks !== null && f.clocks > 0) running.push(`${f.clocks} clock${f.clocks === 1 ? '' : 's'} armed`);
  if (f.channels !== null && f.channels > 0) running.push(`${f.channels} channel${f.channels === 1 ? '' : 's'} live`);
  if (running.length) lines.push(`Running now: ${running.join(' · ')}.`);

  // The headline carries the ONE most important fact: what waits beats what happened beats
  // what runs — and quiet is said plainly.
  const s = salute(f.hour);
  let headline: string;
  const produced = (f.episodes?.length ?? 0) + (f.opportunities ?? 0);
  if (f.approvals !== null && f.approvals > 0) {
    headline = `${s} ${f.approvals} approval${f.approvals === 1 ? '' : 's'} wait${f.approvals === 1 ? 's' : ''} on you${produced > 0 ? ', and the machines produced while you were away' : ''}.`;
  } else if ((f.arcsWaiting?.length ?? 0) > 0) {
    headline = `${s} An arc is parked and needs you — the line below says what for.`;
  } else if (produced > 0) {
    headline = `${s} The machines produced ${since} — it all waits for your review, nothing went out.`;
  } else if (lines.length > 0) {
    headline = `${s} Nothing needs you — here's what's running.`;
  } else {
    headline = `${s} All quiet ${since} — nothing new landed and nothing waits on you.`;
  }

  const quiet = lines.length === 0;
  return { headline, lines, quiet };
}

/** The spoken doors into the briefing. "good morning" IS a briefing ask — Garvis answers a
 *  greeting with the state of the operation, not with chat. */
export function isBriefingAsk(input: string): boolean {
  const t = input.trim().toLowerCase();
  return /^(brief me|briefing|daily brief|morning brief(ing)?|good morning( garvis)?|morning( garvis)?|status report|sitrep|whats (happening|new|going on)|what's (happening|new|going on)|what happened|anything new\??|catch me up|what did i miss)[\s!.?]*$/.test(t);
}
