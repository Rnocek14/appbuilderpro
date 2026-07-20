import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  answerAgentRunQuestion, listAgentRunQuestions, type AgentRunQuestion,
} from '../lib/garvis/agentRunQuestions';

export function useAgentRunQuestions() {
  const { session } = useAuth();
  const [questions, setQuestions] = useState<AgentRunQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) { setQuestions([]); setLoading(false); return; }
    try { setQuestions(await listAgentRunQuestions()); setFailed(false); }
    catch { setFailed(true); }
    finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const channel = supabase.channel(`agent-run-questions-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs' }, () => { void refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, refresh]);

  const answer = useCallback(async (id: string, text: string) => {
    await answerAgentRunQuestion(id, text);
    await refresh();
  }, [refresh]);

  const skip = useCallback((id: string) => answer(id, 'Use your best judgment and continue.'), [answer]);
  return { questions, loading, failed, refresh, answer, skip };
}
