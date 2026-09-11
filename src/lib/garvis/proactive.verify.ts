// Run: npx tsx src/lib/garvis/proactive.verify.ts
// Pins the four rules that decide whether an assistant speaking on its own is useful or a
// notification firehose: real rows only, once ever, worth interrupting for, no theater.
import {
  MAX_PER_WAKE, STALE_APPROVAL_DAYS,
  isDue, observe, pickToSay, rememberSpoken, unspoken, type ProactiveFacts,
} from './proactive';

let passed = 0;
let failed = 0;
const check = (n: string, c: boolean) => {
  if (c) { passed++; console.log(`  ok  - ${n}`); }
  else { failed++; console.error(`  FAIL - ${n}`); }
};

const NOW = '2026-08-14T12:00:00.000Z';
const ago = (h: number): string => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();
const facts = (over: Partial<ProactiveFacts> = {}): ProactiveFacts => ({
  now: NOW, approvals: [], waiting: [], finished: [], watches: [], opportunities: [], ...over,
});

// RULE 1 — REAL ROWS ONLY. Nothing to report is reported as nothing.
{
  check('a quiet operation produces no lines at all', observe(facts()).length === 0);
  check('every probe failing produces no lines (a dead probe is not an event)',
    observe(facts({ approvals: null, waiting: null, finished: null, watches: null, opportunities: null })).length === 0);
  check('…and never a fabricated reassurance', observe(facts()).every(() => false));
}

// RULE 3 — WORTH INTERRUPTING FOR. Age is what turns an approval into news.
{
  const fresh = observe(facts({ approvals: [{ id: 'a1', title: 'Email the Hartley lead', created_at: ago(3) }] }));
  check('an approval raised hours ago is in flight, not news', fresh.length === 0);
  const stale = observe(facts({ approvals: [{ id: 'a1', title: 'Email the Hartley lead', created_at: ago(24 * 3) }] }));
  check('one sitting for days IS news', stale.length === 1);
  check('…it names the actual thing waiting', stale[0]!.text.includes('Email the Hartley lead'));
  check('…says how long, from the row', /3 days/.test(stale[0]!.text));
  check('…says what it blocks (the approval spine, stated)', /nothing goes out/i.test(stale[0]!.text));
  check('…and carries no tappable chip — a turn re-read from the record could not keep one',
    !('action' in stale[0]!));
  check('the threshold is the documented one',
    observe(facts({ approvals: [{ id: 'a', title: 't', created_at: ago(24 * STALE_APPROVAL_DAYS) }] })).length === 1);
}

// A PARKED ARC — the operator is owed the reason, in the reason's own words.
{
  const o = observe(facts({ waiting: [{ id: 'p1', title: 'Market the stroke app', reason: 'the Reddit step needs human hands' }] }));
  check('a parked arc is reported', o.length === 1 && o[0]!.text.includes('Market the stroke app'));
  check('…carrying its recorded reason verbatim', o[0]!.text.includes('the Reddit step needs human hands'));
  const bare = observe(facts({ waiting: [{ id: 'p1', title: 'Some arc', reason: null }] }));
  check('a seam with no recorded reason says exactly that, and invents none',
    bare[0]!.text.includes('a step needs you') && !bare[0]!.text.includes('null'));
}

// A WATCH — a standing order only reads and records; this is where what it read surfaces.
{
  const changed = observe(facts({ watches: [{ id: 'w1', label: "Acme's pricing page", status: 'changed', line: 'x', excerpt: 'Pro moved to $49', at: ago(2) }] }));
  check('a watch that found a change speaks', changed.length === 1 && changed[0]!.text.includes("Acme's pricing page"));
  check('…quoting what changed', changed[0]!.text.includes('Pro moved to $49'));
  check('an UNCHANGED watch is not an event',
    observe(facts({ watches: [{ id: 'w1', label: 'x', status: 'unchanged', line: 'x', excerpt: null, at: ago(2) }] })).length === 0);
  check('an UNREACHABLE watch is not dressed up as a finding',
    observe(facts({ watches: [{ id: 'w1', label: 'x', status: 'unreachable', line: 'x', excerpt: null, at: ago(2) }] })).length === 0);
  check('a change from last month is not news today',
    observe(facts({ watches: [{ id: 'w1', label: 'x', status: 'changed', line: 'x', excerpt: 'y', at: ago(24 * 30) }] })).length === 0);
  check('a watch with no recorded time is not guessed at',
    observe(facts({ watches: [{ id: 'w1', label: 'x', status: 'changed', line: 'x', excerpt: 'y', at: null }] })).length === 0);
}

// FINISHED WORK AND FILED FINDS — named, so they can be deduped by identity, never counted.
{
  const done = observe(facts({ finished: [{ id: 'd1', title: 'The client machine', at: ago(5) }] }));
  check('an arc that finished while they were away is reported', done.length === 1 && done[0]!.text.includes('The client machine'));
  check('…and stale completions stop being announced',
    observe(facts({ finished: [{ id: 'd1', title: 'x', at: ago(24 * 10) }] })).length === 0);
  const opp = observe(facts({ opportunities: [{ id: 'o1', title: 'Lakefront mural commission', found_at: ago(1) }] }));
  check('a filed opportunity is named, not counted', opp[0]!.text.includes('Lakefront mural commission'));
  check('…and carries only words, the same after a reload as when it arrived',
    Object.keys(opp[0]!).sort().join() === 'key,priority,text');
}

// RANKING — blocking beats informational, and the order is deterministic.
{
  const all = observe(facts({
    approvals: [{ id: 'a1', title: 'Send the invoice', created_at: ago(24 * 4) }],
    waiting: [{ id: 'p1', title: 'An arc', reason: 'a seam' }],
    finished: [{ id: 'd1', title: 'Done thing', at: ago(2) }],
    opportunities: [{ id: 'o1', title: 'A find', found_at: ago(2) }],
  }));
  check('everything real is observed', all.length === 4);
  check('the blocking approval speaks first', all[0]!.key === 'approval:a1');
  check('the parked arc outranks a completion', all[1]!.key === 'waiting:p1');
  check('the informational ones come last', all[3]!.key === 'opportunity:o1');
  check('a longer wait outranks a shorter one',
    observe(facts({ approvals: [
      { id: 'young', title: 't', created_at: ago(24 * 2) },
      { id: 'old', title: 't', created_at: ago(24 * 9) },
    ] }))[0]!.key === 'approval:old');
  const twice = JSON.stringify(observe(facts({ waiting: [{ id: 'p1', title: 'A', reason: null }, { id: 'p2', title: 'B', reason: null }] })));
  check('the same facts always produce the same lines in the same order',
    twice === JSON.stringify(observe(facts({ waiting: [{ id: 'p1', title: 'A', reason: null }, { id: 'p2', title: 'B', reason: null }] }))));
}

// RULE 2 — ONCE, EVER. The whole difference between a colleague and a nag.
{
  const obs = observe(facts({ approvals: [{ id: 'a1', title: 'Send it', created_at: ago(24 * 3) }] }));
  check('an unsaid line is available to say', unspoken(obs, []).length === 1);
  check('a said line is never offered again', unspoken(obs, ['approval:a1']).length === 0);
  check('…not even on a later day, when it is older and louder',
    unspoken(observe(facts({ approvals: [{ id: 'a1', title: 'Send it', created_at: ago(24 * 30) }] })), ['approval:a1']).length === 0);
  check('an unrelated key does not suppress it', unspoken(obs, ['approval:other']).length === 1);
}

// RULE 3 (again) — a few per waking. The rest keep.
{
  const many = observe(facts({
    approvals: [
      { id: 'a1', title: 'One', created_at: ago(24 * 5) },
      { id: 'a2', title: 'Two', created_at: ago(24 * 4) },
      { id: 'a3', title: 'Three', created_at: ago(24 * 3) },
    ],
    waiting: [{ id: 'p1', title: 'Arc', reason: null }],
  }));
  const said = pickToSay(many, []);
  check('only a few lines are volunteered at once', said.length === MAX_PER_WAKE);
  check('…and they are the most important ones', said[0]!.key === 'approval:a1');
  check('the rest are still waiting to be said next time',
    pickToSay(many, said.map((s) => s.key)).length === MAX_PER_WAKE);
  check('nothing to say means nothing is said', pickToSay([], []).length === 0);
  check('a caller can ask for silence', pickToSay(many, [], 0).length === 0);
}

// THE RECORD OF WHAT WAS SAID — bounded, and it does not stutter.
{
  check('saying something records it', rememberSpoken([], ['a']).includes('a'));
  check('recording the same key twice keeps one', rememberSpoken(['a'], ['a']).length === 1);
  check('older keys drop out past the cap', rememberSpoken(['a', 'b', 'c'], ['d'], 2).length === 2);
  check('…and it is the NEWEST that survive', rememberSpoken(['a', 'b', 'c'], ['d'], 2).join() === 'c,d');
}

// HOW OFTEN TO LOOK — the dock remounts on every navigation; five queries a page for nothing
// is not free.
{
  check('having never looked, look now', isDue(null, NOW));
  check('an unreadable last-look is treated as never', isDue('not-a-date', NOW));
  check('a look moments ago does not repeat', !isDue(ago(0.01), NOW));
  check('a look long enough ago does', isDue(ago(1), NOW));
  check('the boundary is inclusive', isDue(new Date(Date.parse(NOW) - 5 * 60_000).toISOString(), NOW, 5));
  check('a caller can widen the gap', !isDue(ago(0.5), NOW, 60));
}

// RULE 4 — NO THEATER. The house bans persona chatter and hours-saved claims everywhere; an
// assistant that speaks on its own is exactly where that would creep back in.
{
  const every = observe(facts({
    approvals: [{ id: 'a1', title: 'Send it', created_at: ago(24 * 3) }],
    waiting: [{ id: 'p1', title: 'An arc', reason: 'a seam' }],
    finished: [{ id: 'd1', title: 'Done', at: ago(2) }],
    watches: [{ id: 'w1', label: 'A page', status: 'changed', line: 'x', excerpt: 'it moved', at: ago(2) }],
    opportunities: [{ id: 'o1', title: 'A find', found_at: ago(2) }],
  })).map((o) => o.text).join(' ');
  check('no hours-saved or productivity claims',
    !/hours? saved|saved you|productivit|time back|efficien/i.test(every));
  check('no persona chatter about itself',
    !/\bI've been\b|\bwhile you were\b|\bbusy\b|\bhard at work\b|\bdon't worry\b/i.test(every));
  check('no hype adjectives', !/amazing|incredible|exciting|great news|awesome/i.test(every));
  check('no vague nudges — every line names a real thing', !/might want to|maybe check|you should probably/i.test(every));
  check('nothing claims an action was taken on the operator\'s behalf',
    !/\bI sent\b|\bI published\b|\bI emailed\b|\bwent out\b/i.test(every));
}

// ---- the SMS channel rides the SAME rules (SW5.2) — textual proof on the pulse ----
{
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const pulse = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/functions/garvis-pulse/index.ts'), 'utf8');
  check('the pulse texts through observe/pickToSay, never its own ranking', pulse.includes('pickToSay(observe(facts)'));
  check('one text per waking at most (texts are dearer than dock lines)', pulse.includes('pickToSay(observe(facts), spoken, 1)'));
  check('the server ledger claims by insert before any send', pulse.indexOf("onConflict: 'owner_id,key,channel', ignoreDuplicates: true") < pulse.indexOf('api.twilio.com/2010-04-01'));
  check('only verified, opted-in lines are texted', pulse.includes("eq('proactive_enabled', true).not('verified_at', 'is', null)"));
  check('the sent line lands in the one record, channel-stamped', pulse.includes("role: 'garvis', text: say.text, channel: 'sms'"));
}

console.log(`\nproactive.verify: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} proactive check(s) failed`);
