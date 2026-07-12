// src/hooks/useCommander.ts
// The conversational front door's brain — ONE BRAIN (UX redesign): the transcript is PERSISTENT
// (command_messages, app_0048 — refresh no longer wipes the conversation) and every turn runs
// REFLEXIVE RETRIEVAL over the owner's own artifacts (retrieveForPrompt), so the front door
// answers from what's actually on record instead of improvising from a snapshot string.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rawComplete } from '../lib/aiClient';
import { supabase } from '../lib/supabase';
import { COMMANDER_SYSTEM, buildCommanderUser, parseCommand } from '../lib/garvis/commander';
import { usePortfolio } from './usePortfolio';
import { useMissions } from './useMissions';
import { useMind } from './useMind';
import { goalsDigest } from '../lib/garvis/goalsRun';
import { retrieveForPrompt } from '../lib/garvis/ask';
import { runGarvisAct } from '../lib/garvis';
import { patchWorkingState, loadWorkingState } from '../lib/garvis/workingStateRun';

export interface ChatMessage {
  id: string;
  role: 'user' | 'garvis';
  text: string;
  missionId?: string; // when Garvis spun up a mission in response
  /** A tappable next step (e.g. "Review the draft →") — the handoff is never prose-only. */
  action?: { label: string; to: string };
}

const THREAD_WINDOW = 40; // recent turns loaded on mount; the full record stays in the DB

/** SUMMONED CANVAS (UX redesign, architectural tier): what Garvis opened beside the thread —
 *  a studio pre-loaded with a venture's materials, or the exploration galaxy mid-dive. */
export type Canvas =
  | { surface: 'mailer' | 'video'; worldId: string; clusterId: string; clusterSlug: string; worldTitle: string }
  | { surface: 'explore'; query: string };

type StudioSurface = 'mailer' | 'video';
type StudioCanvas = Extract<Canvas, { surface: StudioSurface }>;

const FLAVOR_FOR: Record<StudioSurface, string> = { mailer: 'direct_mail', video: 'video' };

/** Resolve "the mailer for <world>" to real ids: world by (fuzzy) title, then its studio cluster
 *  by charter flavor. Honest nulls with a reason — never a guess at the wrong world. */
async function resolveStudio(surface: StudioSurface, worldName: string | null):
  Promise<{ canvas?: StudioCanvas; reason?: string }> {
  const { data: worlds } = await supabase.from('knowledge_worlds').select('id, title').limit(100);
  const all = ((worlds ?? []) as { id: string; title: string }[]);
  if (!all.length) return { reason: 'You have no ventures yet — create one in Ventures and I can open its studios.' };
  let world = worldName
    ? all.find((w) => w.title.toLowerCase() === worldName.toLowerCase())
      ?? all.find((w) => w.title.toLowerCase().includes(worldName.toLowerCase()))
    : (all.length === 1 ? all[0] : undefined);
  if (!world) {
    return { reason: worldName
      ? `I don't see a venture named “${worldName}” — yours are: ${all.map((w) => w.title).join(', ')}.`
      : `Which venture? You have: ${all.map((w) => w.title).join(', ')}.` };
  }
  const { data: clusters } = await supabase.from('knowledge_clusters')
    .select('id, slug, title, charter').eq('world_id', world.id).not('charter', 'is', null).limit(100);
  const hit = ((clusters ?? []) as { id: string; slug: string; charter: { flavor?: string } | null }[])
    .find((c) => c.charter?.flavor === FLAVOR_FOR[surface]);
  if (!hit) return { reason: `${world.title} doesn't have a ${surface === 'mailer' ? 'postcard' : 'video'} studio area yet — open the venture and add one, or ask me to draft it.` };
  return { canvas: { surface, worldId: world.id, clusterId: hit.id, clusterSlug: hit.slug, worldTitle: world.title } };
}

export function useCommander() {
  const { apps } = usePortfolio();
  const missionsApi = useMissions();
  const { mindContext, emit: emitMindEvent } = useMind();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  // The summoned canvas survives refresh and navigate-away-and-back (sessionStorage) — the thread
  // persists its "open beside us" announcements, so the surface they describe must persist too.
  // Since app_0052 it ALSO rides the working_state row: a fresh session on any device restores
  // the desk you left ("resume where you were" — design review Phase 6), sessionStorage first.
  const [canvas, setCanvasState] = useState<Canvas | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('ff:canvas') ?? 'null') as Canvas | null; } catch { return null; }
  });
  const setCanvas = (c: Canvas | null) => {
    setCanvasState(c);
    try { c ? sessionStorage.setItem('ff:canvas', JSON.stringify(c)) : sessionStorage.removeItem('ff:canvas'); } catch { /* best-effort */ }
    void patchWorkingState({ canvas: c }); // travels with the owner; fire-and-forget
  };
  useEffect(() => {
    // Fresh session (no sessionStorage) → restore the traveling desk once, if one is staged.
    if (canvas) return;
    let live = true;
    void loadWorkingState().then((ws) => {
      const c = (ws?.canvas ?? null) as Canvas | null;
      if (live && c && typeof c === 'object' && 'surface' in c) {
        setCanvasState(c);
        try { sessionStorage.setItem('ff:canvas', JSON.stringify(c)); } catch { /* best-effort */ }
      }
    }).catch(() => { /* no row, no restore — the cold desk is honest */ });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const navigate = useNavigate();

  // The thread survives refresh: load the recent transcript once (fail-soft — an empty thread
  // renders the same first-run experience as before).
  useEffect(() => {
    let live = true;
    void supabase.from('command_messages')
      .select('id, role, text, mission_id, created_at')
      .order('created_at', { ascending: false }).limit(THREAD_WINDOW)
      .then(({ data }) => {
        if (!live || !data?.length) return;
        setMessages((prev) => prev.length ? prev : (data as { id: string; role: 'user' | 'garvis'; text: string; mission_id: string | null }[])
          .reverse()
          .map((m) => ({ id: m.id, role: m.role, text: m.text, missionId: m.mission_id ?? undefined })));
      });
    return () => { live = false; };
  }, []);

  const persist = (m: Omit<ChatMessage, 'id'>) => {
    // Fire-and-forget: a lost row must never break the conversation.
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      return supabase.from('command_messages').insert({
        owner_id: uid, role: m.role, text: m.text, mission_id: m.missionId ?? null,
      });
    }).then(() => {}, () => {});
  };

  const push = (m: Omit<ChatMessage, 'id'>) => {
    const msg = { ...m, id: crypto.randomUUID() };
    setMessages((prev) => [...prev, msg]);
    persist(m);
    return msg;
  };

  /** Post a Garvis message without a user turn — used for proactive greetings (opportunities). */
  const postGarvis = useCallback((text: string) => {
    setMessages((prev) => (prev.some((m) => m.text === text) ? prev : [...prev, { id: crypto.randomUUID(), role: 'garvis', text }]));
  }, []);

  const send = useCallback(async (message: string) => {
    const text = message.trim();
    if (!text || thinking) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    push({ role: 'user', text });
    setThinking(true);
    try {
      const snapshot = apps
        .filter((a) => !a.archived)
        .map((a) => `- ${a.name} (${a.stage}${a.strategic_importance ? `, ${a.strategic_importance}` : ''}): ${a.description ?? 'no description'}`)
        .join('\n');

      // The owner's PROJECT GOALS steer the front door (goalsRun, fail-soft '') and REFLEXIVE
      // RETRIEVAL grounds it (ask.ts) — the front door now answers from what's actually on
      // record, cited, alongside the identity/mind digest. Both fail-soft.
      const [goals, knowledge] = await Promise.all([goalsDigest(), retrieveForPrompt(text)]);
      const mind = [mindContext(), goals, knowledge].filter(Boolean).join('\n\n');

      const r = await rawComplete([
        { role: 'system', content: COMMANDER_SYSTEM },
        { role: 'user', content: buildCommanderUser(text, snapshot, history, mind) },
      ], 1000);
      const cmd = parseCommand(r.text);

      if (cmd.kind === 'reply') {
        push({ role: 'garvis', text: cmd.text });
        emitMindEvent({ event_type: 'commander_exchange', subject: `Asked: "${text.slice(0, 160)}" → replied`, source: 'commander' });
        return;
      }

      // BUILD — "build me a SaaS for restaurant reservations" flows in one motion: Garvis expands
      // the ask into a complete build brief and lands you at the forge with everything pre-filled
      // (the existing ?idea= seed channel) — one press starts the build. From ~9 decisions to 2.
      if (cmd.kind === 'build') {
        push({ role: 'garvis', text: `${cmd.preface} I've written the full brief from what you said — it's pre-filled at the forge. Press Generate when it reads right; I'll be here when it's built.` });
        emitMindEvent({ event_type: 'commander_exchange', subject: `Build handoff: "${cmd.prompt.slice(0, 160)}"`, source: 'commander' });
        navigate(`/new?idea=${encodeURIComponent(cmd.prompt.slice(0, 1900))}`);
        return;
      }

      // EXPLORE — the rabbit hole: "take me down the rabbit hole on X" opens the exploration
      // galaxy already falling into that curiosity. The fun of eighteen tabs open — branches,
      // trails, parallel dives — organized and saved. On wide screens the galaxy is a SUMMONED
      // CANVAS beside this thread (dive without leaving the conversation); below lg the side
      // panel doesn't render, so small screens go full-bleed via the ?dive= seed instead.
      if (cmd.kind === 'explore') {
        emitMindEvent({ event_type: 'commander_exchange', subject: `Rabbit hole: "${cmd.query.slice(0, 160)}"`, source: 'commander' });
        const query = cmd.query.slice(0, 500);
        if (window.matchMedia('(min-width: 1024px)').matches) {
          setCanvas({ surface: 'explore', query });
          push({ role: 'garvis', text: `${cmd.preface} The rabbit hole on “${cmd.query}” is open beside us — branch it, wander, chase the tangents. Tell me what you find and I'll pull threads with you; everything you grow stays saved.` });
        } else {
          push({ role: 'garvis', text: `${cmd.preface} Opening the rabbit hole on “${cmd.query}” — branch it, wander, chase the tangents. Everything you grow stays saved, and I'm right here when you surface.` });
          navigate(`/garvis/explore?dive=${encodeURIComponent(query)}`);
        }
        return;
      }

      // OPEN — a summoned canvas: Garvis opens the studio BESIDE the conversation, pre-loaded
      // with the venture's real materials. Resolution is honest: an unknown venture or a missing
      // studio area gets a plain answer naming what exists, never a guess at the wrong world.
      // Below lg the side panel doesn't render, so small screens go to the venture's studio page
      // instead — the same components live there (never announce a surface the user can't see).
      if (cmd.kind === 'open') {
        const r = await resolveStudio(cmd.surface, cmd.world);
        if (r.canvas) {
          const studioName = r.canvas.surface === 'mailer' ? 'postcard studio' : 'video studio';
          if (window.matchMedia('(min-width: 1024px)').matches) {
            setCanvas(r.canvas);
            push({ role: 'garvis', text: `${cmd.preface} The ${studioName} for ${r.canvas.worldTitle} is open beside us — your brand, photos, and takes are loaded. Keep talking to me while you work.` });
          } else {
            push({ role: 'garvis', text: `${cmd.preface} Taking you into the ${studioName} for ${r.canvas.worldTitle} — your brand, photos, and takes are loaded.` });
            navigate(`/garvis/webs/${r.canvas.worldId}?area=${encodeURIComponent(r.canvas.clusterSlug)}`);
          }
        } else {
          push({ role: 'garvis', text: r.reason ?? "I couldn't find that studio." });
        }
        return;
      }

      // ACT — hands at the front door (one brain, part 2): Garvis runs its gated tool loop RIGHT
      // NOW and narrates each step as an event line in the thread (the No-Theater contract: every
      // line maps to a real runtime event). Anything outward still stops at Approvals.
      if (cmd.kind === 'act') {
        push({ role: 'garvis', text: cmd.preface });
        const narrId = crypto.randomUUID();
        const lines: string[] = [];
        setMessages((prev) => [...prev, { id: narrId, role: 'garvis', text: '⏺ working…' }]);
        const paint = () => setMessages((prev) => prev.map((m) => (m.id === narrId ? { ...m, text: lines.join('\n') || '⏺ working…' } : m)));
        // NARRATION, not a transcript dump (flow audit): terminal events carry the FULL final
        // output as their detail (the answer rendered twice, once mangled by the ⏺ prefix) and
        // 'started' just echoes the user's own words. Tool steps read as human actions, not
        // internal snake_case names.
        const FRIENDLY: Record<string, string> = {
          draft_world: 'Designing the world from your intent…',
          list_worlds: 'Reading your worlds…',
          ask_worlds: 'Consulting the knowledge on record…',
          recall_knowledge: 'Recalling approved decisions and lessons…',
          log_decision: 'Proposing a decision for your approval…',
          record_outcome: 'Proposing an outcome for the record…',
          generate_short_script: 'Writing the script…',
          create_invoice: 'Drafting the invoice…',
          queue_invoice_send: 'Queueing the send for your approval…',
          list_invoices: 'Checking the invoices on record…',
          propose_goal: 'Proposing the goal…',
          list_apps: 'Reading the portfolio…',
          get_app_profile: 'Reading the product profile…',
          query_metrics: 'Reading the metrics…',
          get_repo_state: 'Checking the repo…',
        };
        let sawDraftWorld = false;
        try {
          const run = await runGarvisAct({
            title: cmd.instruction.slice(0, 80),
            input: cmd.instruction,
            budgetUsd: 0.5,
            onEvent: (e) => {
              if (!e.detail || e.status === 'started' || e.status === 'finished' || e.status === 'awaiting_approval') return;
              if (e.status === 'tool' && e.detail === 'draft_world') sawDraftWorld = true;
              const line = e.status === 'tool' ? (FRIENDLY[e.detail] ?? `${e.detail.replace(/_/g, ' ')}…`) : e.detail;
              lines.push(`⏺ ${line}`); paint();
            },
          });
          if (lines.length) persist({ role: 'garvis', text: lines.join('\n') }); // narration, persisted once
          else setMessages((prev) => prev.filter((m) => m.id !== narrId)); // no events came — drop the '⏺ working…' shell instead of leaving it stuck
          const out = typeof run?.output === 'string' ? run.output : '';
          push({
            role: 'garvis',
            text: out.trim()
              || (run?.status === 'failed'
                ? 'That ran into a problem — the run is on the ledger with the error.'
                : 'Done — the results are on the record (anything outward is waiting in Approvals).'),
            // the handoff is never prose-only: a drafted world ends with the door to it
            ...(sawDraftWorld ? { action: { label: 'Review the draft →', to: '/garvis/webs' } } : {}),
          });
          emitMindEvent({ event_type: 'commander_exchange', subject: `Acted: "${text.slice(0, 160)}"`, source: 'commander' });
        } catch (e) {
          push({ role: 'garvis', text: `I hit a snag acting on that: ${e instanceof Error ? e.message : 'something went wrong'}.` });
        }
        return;
      }

      // It's work → resolve the app (if Garvis matched one) and spin up a mission — and RUN it.
      // UX redesign: the "Run it" click was a duplicate gate. Mission workers are draft-only by
      // construction (consequences still stop at Approvals), so asking twice was pure friction.
      // The card still shows live progress and a Stop stays one click away.
      const appId = cmd.app ? (apps.find((a) => a.name.toLowerCase() === cmd.app!.toLowerCase())?.id ?? null) : null;
      const missionId = await missionsApi.planMission({ objective: cmd.objective, subject: cmd.subject, appId });
      push({ role: 'garvis', text: cmd.preface, missionId: missionId ?? undefined });
      if (missionId) void missionsApi.runMission(missionId);
      emitMindEvent({
        event_type: 'mission_planned',
        subject: `Mission: ${cmd.objective.slice(0, 200)}`,
        source: 'commander',
        app_id: appId,
        payload: { subject: cmd.subject },
      });
    } catch (e) {
      push({ role: 'garvis', text: `I hit a snag: ${e instanceof Error ? e.message : 'something went wrong'}.` });
    } finally {
      setThinking(false);
    }
  }, [apps, messages, missionsApi, thinking, mindContext, emitMindEvent]);

  return {
    messages,
    thinking,
    send,
    postGarvis,
    // the summoned studio canvas (null = conversation only); Command renders it beside the thread
    canvas,
    closeCanvas: () => setCanvas(null),
    // mission passthroughs so the chat can render + run the work it proposed
    missions: missionsApi.missions,
    tasksByMission: missionsApi.tasksByMission,
    runMission: missionsApi.runMission,
    busyId: missionsApi.busyId,
  };
}
