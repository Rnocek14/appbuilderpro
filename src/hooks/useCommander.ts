// src/hooks/useCommander.ts
// The conversational front door's brain. Holds an (ephemeral) conversation, routes each message through
// the Commander dispatcher, and either replies or spins up a mission — reusing useMissions underneath.
// No new table: the durable record is the mission; the chat transcript lives for the session.

import { useCallback, useState } from 'react';
import { rawComplete } from '../lib/aiClient';
import { COMMANDER_SYSTEM, buildCommanderUser, parseCommand } from '../lib/garvis/commander';
import { usePortfolio } from './usePortfolio';
import { useMissions } from './useMissions';
import { useMind } from './useMind';
import { goalsDigest } from '../lib/garvis/goalsRun';

export interface ChatMessage {
  id: string;
  role: 'user' | 'garvis';
  text: string;
  missionId?: string; // when Garvis spun up a mission in response
}

export function useCommander() {
  const { apps } = usePortfolio();
  const missionsApi = useMissions();
  const { mindContext, emit: emitMindEvent } = useMind();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);

  const push = (m: Omit<ChatMessage, 'id'>) => {
    const msg = { ...m, id: crypto.randomUUID() };
    setMessages((prev) => [...prev, msg]);
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

      // The owner's PROJECT GOALS steer the front door (goalsRun, fail-soft '') — different
      // projects, each adapted toward what it's for, alongside the identity/mind digest.
      const goals = await goalsDigest();
      const mind = [mindContext(), goals].filter(Boolean).join('\n\n');

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
