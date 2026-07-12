// src/hooks/useCommander.ts
// The conversational front door's brain — ONE BRAIN (UX redesign): the transcript is PERSISTENT
// (command_messages, app_0048 — refresh no longer wipes the conversation) and every turn runs
// REFLEXIVE RETRIEVAL over the owner's own artifacts (retrieveForPrompt), so the front door
// answers from what's actually on record instead of improvising from a snapshot string.

import { useCallback, useEffect, useState } from 'react';
import { rawComplete } from '../lib/aiClient';
import { supabase } from '../lib/supabase';
import { COMMANDER_SYSTEM, buildCommanderUser, parseCommand } from '../lib/garvis/commander';
import { usePortfolio } from './usePortfolio';
import { useMissions } from './useMissions';
import { useMind } from './useMind';
import { goalsDigest } from '../lib/garvis/goalsRun';
import { retrieveForPrompt } from '../lib/garvis/ask';
import { runGarvisAct } from '../lib/garvis';

export interface ChatMessage {
  id: string;
  role: 'user' | 'garvis';
  text: string;
  missionId?: string; // when Garvis spun up a mission in response
}

const THREAD_WINDOW = 40; // recent turns loaded on mount; the full record stays in the DB

export function useCommander() {
  const { apps } = usePortfolio();
  const missionsApi = useMissions();
  const { mindContext, emit: emitMindEvent } = useMind();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);

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

      // ACT — hands at the front door (one brain, part 2): Garvis runs its gated tool loop RIGHT
      // NOW and narrates each step as an event line in the thread (the No-Theater contract: every
      // line maps to a real runtime event). Anything outward still stops at Approvals.
      if (cmd.kind === 'act') {
        push({ role: 'garvis', text: cmd.preface });
        const narrId = crypto.randomUUID();
        const lines: string[] = [];
        setMessages((prev) => [...prev, { id: narrId, role: 'garvis', text: '⏺ working…' }]);
        const paint = () => setMessages((prev) => prev.map((m) => (m.id === narrId ? { ...m, text: lines.join('\n') || '⏺ working…' } : m)));
        try {
          const run = await runGarvisAct({
            title: cmd.instruction.slice(0, 80),
            input: cmd.instruction,
            budgetUsd: 0.5,
            onEvent: (e) => { if (e.detail) { lines.push(`⏺ ${e.detail}`); paint(); } },
          });
          if (lines.length) persist({ role: 'garvis', text: lines.join('\n') }); // narration, persisted once
          const out = typeof run?.output === 'string' ? run.output : '';
          push({
            role: 'garvis',
            text: out.trim()
              || (run?.status === 'failed'
                ? 'That ran into a problem — the run is on the ledger with the error.'
                : 'Done — the results are on the record (anything outward is waiting in Approvals).'),
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
    // mission passthroughs so the chat can render + run the work it proposed
    missions: missionsApi.missions,
    tasksByMission: missionsApi.tasksByMission,
    runMission: missionsApi.runMission,
    busyId: missionsApi.busyId,
  };
}
