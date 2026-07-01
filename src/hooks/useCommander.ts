// src/hooks/useCommander.ts
// The conversational front door's brain. Holds an (ephemeral) conversation, routes each message through
// the Commander dispatcher, and either replies or spins up a mission — reusing useMissions underneath.
// No new table: the durable record is the mission; the chat transcript lives for the session.

import { useCallback, useState } from 'react';
import { rawComplete } from '../lib/aiClient';
import { COMMANDER_SYSTEM, buildCommanderUser, parseCommand } from '../lib/garvis/commander';
import { usePortfolio } from './usePortfolio';
import { useMissions } from './useMissions';

export interface ChatMessage {
  id: string;
  role: 'user' | 'garvis';
  text: string;
  missionId?: string; // when Garvis spun up a mission in response
}

export function useCommander() {
  const { apps } = usePortfolio();
  const missionsApi = useMissions();
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

      const r = await rawComplete([
        { role: 'system', content: COMMANDER_SYSTEM },
        { role: 'user', content: buildCommanderUser(text, snapshot, history) },
      ], 1000);
      const cmd = parseCommand(r.text);

      if (cmd.kind === 'reply') {
        push({ role: 'garvis', text: cmd.text });
        return;
      }

      // It's work → resolve the app (if Garvis matched one) and spin up a mission.
      const appId = cmd.app ? (apps.find((a) => a.name.toLowerCase() === cmd.app!.toLowerCase())?.id ?? null) : null;
      const missionId = await missionsApi.planMission({ objective: cmd.objective, subject: cmd.subject, appId });
      push({ role: 'garvis', text: cmd.preface, missionId: missionId ?? undefined });
    } catch (e) {
      push({ role: 'garvis', text: `I hit a snag: ${e instanceof Error ? e.message : 'something went wrong'}.` });
    } finally {
      setThinking(false);
    }
  }, [apps, messages, missionsApi, thinking]);

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
