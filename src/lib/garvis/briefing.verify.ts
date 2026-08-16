// Run: npx tsx src/lib/garvis/briefing.verify.ts
// Pins the speak-first contract: real facts become the report, failed probes become honest
// silence (never fake zeros), quiet is stated as quiet, and the greeting doors open it.
import { composeBriefing, isBriefingAsk, type BriefingFacts } from './briefing';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const base: BriefingFacts = {
  hour: 8, sinceHours: 14, episodes: [], opportunities: 0,
  arcsFinished: [], arcsWaiting: [], approvals: 0, clocks: 0, channels: 0, predictions: null, read: null,
};

// The full morning: production + waits, priorities right.
{
  const b = composeBriefing({
    ...base,
    episodes: [{ channel: 'Money Facts', title: 'the rule of 72' }, { channel: 'Good Dog Facts', title: 'head tilts' }],
    opportunities: 5,
    arcsFinished: ['Market stroke app mindweave'],
    arcsWaiting: [{ title: 'Vertical empire', reason: 'the CTA link needs you first' }],
    approvals: 3, clocks: 4, channels: 2,
  });
  check('approvals lead the headline (what WAITS beats what happened)', /3 approvals wait/.test(b.headline) && b.headline.startsWith('Morning.'));
  check('episodes report with channel + title from real rows', b.lines.some((l) => l.includes('2 episodes drafted') && l.includes('Money Facts')));
  check('opportunities, finished arcs, parked arcs, queue, and running-now all report',
    ['5 opportunities filed', 'Finished', 'Arc parked: “Vertical empire”', '3 approvals waiting', 'Running now: 4 clocks armed · 2 channels live']
      .every((s) => b.lines.some((l) => l.includes(s))));
  check('the parked arc carries its REASON', b.lines.some((l) => l.includes('the CTA link needs you first')));
  check('not quiet', !b.quiet);
}

// Quiet is a valid report — stated plainly, nothing invented.
{
  const b = composeBriefing(base);
  check('all-quiet says so honestly', b.quiet && /All quiet/.test(b.headline) && /nothing waits on you/.test(b.headline));
  check('no lines are invented on a quiet day', b.lines.length === 0);
}

// Failed probes are SILENCE, never fake zeros.
{
  const b = composeBriefing({ ...base, episodes: null, opportunities: null, approvals: null, clocks: 4, channels: null });
  check('a failed probe never reports (no "0 episodes", no fake counts)',
    !b.lines.some((l) => /episode|opportunit|approval/.test(l)));
  check('surviving probes still report', b.lines.some((l) => l.includes('4 clocks armed')));
}

// Priorities: production without approvals leads with review-honesty.
{
  const b = composeBriefing({ ...base, episodes: [{ channel: 'A', title: 'x' }] });
  check('production headline says it WAITS FOR REVIEW (nothing went out)', /waits for your review, nothing went out/.test(b.headline));
  const long = composeBriefing({ ...base, sinceHours: 80, opportunities: 2 });
  check('a long gap phrases its span honestly', /these 3 days/.test(long.lines[0]!));
}

// Time of day rides the salutation; overflow caps at +N more.
{
  check('evening salutes as evening', composeBriefing({ ...base, hour: 21 }).headline.startsWith('Evening.'));
  const many = composeBriefing({ ...base, episodes: Array.from({ length: 6 }, (_, i) => ({ channel: 'C', title: `t${i}` })) });
  check('episode overflow caps at three named +N more', many.lines[0]!.includes('+3 more'));
}

// The doors — greetings and status asks open the briefing; real asks never do.
{
  for (const s of ['good morning', 'morning', 'brief me', 'status report', 'whats happening', 'catch me up', 'what did i miss', 'anything new?']) {
    check(`door: "${s}"`, isBriefingAsk(s));
  }
  for (const s of ['hey', 'good morning to send the postcard', 'whats happening with the queue', 'draft an episode', 'morning show reel']) {
    check(`not a door: "${s}"`, !isBriefingAsk(s));
  }
}

// Doctrine hygiene: no persona language, no hours-saved claims, anywhere.
{
  const b = composeBriefing({
    ...base, episodes: [{ channel: 'C', title: 't' }], opportunities: 3,
    arcsFinished: ['A'], arcsWaiting: [{ title: 'W', reason: 'r' }], approvals: 1, clocks: 1, channels: 1,
  });
  const all = [b.headline, ...b.lines].join(' ');
  check('no persona language, no hours-saved claims', !/\bi am\b|\bmy name\b|hours? saved|saved you/i.test(all));
}

// ---- MORE WAYS THE OPERATOR ASKS (full-stack gauntlet) — these were paying for a model call ----
{
  check('"hows everything looking" is a briefing ask', isBriefingAsk('hows everything looking'));
  check('"hows things going" is a briefing ask', isBriefingAsk('hows things going'));
  check('"whered we leave off" is a briefing ask', isBriefingAsk('whered we leave off'));
  check('"where did we leave off" is a briefing ask', isBriefingAsk('where did we leave off'));
  check('a real ask is NOT eaten by the door', !isBriefingAsk('hows the postcard looking'));
}

console.log(`\nbriefing.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} briefing check(s) failed`);
