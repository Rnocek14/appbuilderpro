// supabase/functions/garvis-consolidate/index.ts
// THE CONSOLIDATION LOOP — the missing edge that turns memory into judgment. The mind_events
// spine was designed to be "re-consolidated by a smarter future model" (app_0019), but nothing
// ever read it back: events accumulated, convictions never formed. This worker closes that loop
// on the heartbeat (weekly): it reads each owner's recent events, asks the model for candidate
// LESSONS grounded ONLY in what actually happened, and files them as PROPOSED garvis_knowledge —
// the existing human approval gate. Approved lessons already flow into agent runs AND builder
// edits (the knowledge digest), so an approved proposal immediately sharpens future behavior.
//
// HONESTY RULES:
//  - Proposals only — nothing enters reasoning memory without the operator's approval.
//  - Grounded only: every candidate must cite the event subjects it generalizes from; the model
//    is told to return NOTHING when the events don't actually recur or teach anything.
//  - Thin data stays silent: fewer than MIN_EVENTS new events since the last consolidation → skip.
//  - Dedupe against every existing knowledge title (proposed or approved) — no groundhog lessons.
//
// Secrets: WORKER_SECRET (x-worker-secret). Scheduled weekly by the heartbeat (app_0088).
// Deploy: supabase functions deploy garvis-consolidate --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { stampHeartbeat } from '../_shared/heartbeat.ts';
import { complete } from '../_shared/ai.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-worker-secret' };

const MIN_EVENTS = 15;       // fewer new events than this → nothing worth generalizing yet
const MAX_EVENTS = 120;      // context window for one owner's consolidation
const MAX_PROPOSALS = 3;     // per owner per run — judgment forms slowly, on purpose
const TIME_BUDGET_MS = 100_000;

const SYSTEM = `You distill a personal operating system's event log into durable LESSONS for its one operator.
Given recent events (type, source, subject), propose AT MOST ${MAX_PROPOSALS} candidate lessons — patterns that
genuinely RECUR across multiple events and would change future decisions if remembered.
Return STRICT JSON only: an array of {"kind":"lesson"|"outcome","title":"<≤80 chars>","body":"<1-3 sentences,
grounded ONLY in the events>","evidence":["<verbatim event subject>", ...]}.
Rules: every lesson MUST cite 2+ verbatim event subjects as evidence. Never invent numbers, causes, or events.
If nothing actually recurs or teaches anything, return []. No preamble, no markdown fences.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('WORKER_SECRET');
  if (!secret || req.headers.get('x-worker-secret') !== secret) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await stampHeartbeat(admin, 'garvis-consolidate');
  const started = Date.now();

  // Owners with recent mind activity — the event spine names them; no webhook required.
  const { data: recentOwners, error } = await admin.from('mind_events')
    .select('owner_id')
    .gte('created_at', new Date(Date.now() - 14 * 24 * 3_600_000).toISOString())
    .limit(2000);
  if (error) return json({ error: error.message }, 500);
  const owners = [...new Set(((recentOwners ?? []) as { owner_id: string }[]).map((r) => r.owner_id))];

  let checked = 0, proposed = 0, skippedThin = 0;
  for (const ownerId of owners) {
    if (Date.now() - started > TIME_BUDGET_MS) break; // honest partial progress; next week continues
    checked++;
    try {
      // Since the LAST consolidation (its own mind_event is the marker) — or 14 days back.
      const { data: lastRun } = await admin.from('mind_events')
        .select('created_at').eq('owner_id', ownerId).eq('source', 'consolidation')
        .order('created_at', { ascending: false }).limit(1);
      const since = (lastRun?.[0] as { created_at?: string } | undefined)?.created_at
        ?? new Date(Date.now() - 14 * 24 * 3_600_000).toISOString();

      const { data: events } = await admin.from('mind_events')
        .select('event_type, source, subject, created_at')
        .eq('owner_id', ownerId).neq('source', 'consolidation')
        .gte('created_at', since)
        .order('created_at', { ascending: false }).limit(MAX_EVENTS);
      const evs = (events ?? []) as { event_type: string; source: string; subject: string | null }[];
      if (evs.length < MIN_EVENTS) { skippedThin++; continue; }

      // Existing titles (any status) — a lesson proposed once is never re-proposed.
      const { data: existing } = await admin.from('garvis_knowledge')
        .select('title').eq('owner_id', ownerId).limit(400);
      const seenTitles = new Set(((existing ?? []) as { title: string }[]).map((k) => k.title.trim().toLowerCase()));

      const log = evs.map((e) => `[${e.event_type}/${e.source}] ${(e.subject ?? '').slice(0, 160)}`).join('\n');
      const res = await complete([
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `EVENT LOG (newest first, ${evs.length} events):\n${log}\n\nCandidate lessons (strict JSON array):` },
      ], { maxTokens: 1200 });

      let candidates: { kind?: string; title?: string; body?: string; evidence?: string[] }[] = [];
      try {
        const txt = res.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) candidates = parsed;
      } catch { /* unparseable → propose nothing; never guess */ }

      let inserted = 0;
      for (const c of candidates.slice(0, MAX_PROPOSALS)) {
        const title = (c.title ?? '').trim();
        const body = (c.body ?? '').trim();
        const evidence = Array.isArray(c.evidence) ? c.evidence.filter((x) => typeof x === 'string') : [];
        const kind = c.kind === 'outcome' ? 'outcome' : 'lesson';
        // Grounding gate: no title/body, thin evidence, or an already-known title → dropped.
        if (!title || !body || evidence.length < 2) continue;
        if (seenTitles.has(title.toLowerCase())) continue;
        const { error: insErr } = await admin.from('garvis_knowledge').insert({
          owner_id: ownerId, kind, title, body: `${body}\n\nEvidence: ${evidence.slice(0, 4).join(' · ')}`,
          source: 'consolidation', status: 'proposed',
        });
        if (!insErr) { inserted++; seenTitles.add(title.toLowerCase()); }
      }

      // The marker event — both the audit trail and next run's `since` anchor. Written even when
      // nothing was proposed, so a noisy-but-lessonless fortnight isn't re-read forever.
      await admin.from('mind_events').insert({
        owner_id: ownerId, event_type: 'note', source: 'consolidation',
        subject: inserted > 0
          ? `Consolidation: proposed ${inserted} candidate lesson${inserted === 1 ? '' : 's'} from ${evs.length} events — review in Knowledge`
          : `Consolidation: read ${evs.length} events — nothing recurred enough to propose`,
        payload: { events: evs.length, proposed: inserted, since },
      }).then(() => {}, () => {});
      proposed += inserted;
    } catch { /* one owner's failure never blocks the rest */ }
  }

  return json({ ok: true, checked, proposed, skippedThin });
});
