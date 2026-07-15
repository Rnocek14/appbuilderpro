// src/components/garvis/StudioChat.tsx
// The chat that lives inside a production area — the thing that makes a cluster a STUDIO. Talk to it
// ("make the postcard more luxury") and it creates/revises artifacts or queues an approval. It never
// sends: the only outward verb it can produce is a proposal into the Approval queue.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Send, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui';
import { useToast } from '../../context/ToastContext';
import { runStudioTurn, loadStudioContext } from '../../lib/garvis/studioChat';
import { listStudioMessages, type StudioMessage } from '../../lib/garvis/artifacts';
import type { Charter, WorkTool } from '../../lib/garvis/workweb';

interface Props {
  worldId: string;
  webTitle: string;
  objective?: string | null;
  clusterId: string;
  cluster: { title: string; summary: string; charter: Charter };
  tools: WorkTool[];
  results?: { sent: number; replies: number; pendingApprovals: number } | null;
  onChanged: () => void;   // artifact created/revised → parent refreshes
}

export function StudioChat({ worldId, webTitle, objective, clusterId, cluster, tools, results, onChanged }: Props) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    listStudioMessages(clusterId).then((m) => { if (live) setMessages(m); }).catch(() => {});
    return () => { live = false; };
  }, [clusterId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, busy]);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setBusy(true);
    // Optimistic user bubble.
    setMessages((prev) => [...prev, { id: `tmp-${Math.random()}`, role: 'user', content: message, decision: null, created_at: new Date().toISOString() }]);
    try {
      const ctx = await loadStudioContext({ worldId, webTitle, objective, cluster, clusterId, tools, results });
      const res = await runStudioTurn(clusterId, ctx, message);
      setMessages((prev) => [...prev, { id: `tmp-${Math.random()}`, role: 'garvis', content: res.reply, decision: res.decision, created_at: new Date().toISOString() }]);
      if (res.changed) { onChanged(); }
      if (res.decision.kind === 'propose_approval') toast('info', 'Queued for approval — nothing sent.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'The studio could not respond.');
      setMessages((prev) => [...prev, { id: `tmp-${Math.random()}`, role: 'garvis', content: '(that turn failed — try again)', decision: null, created_at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, worldId, webTitle, objective, cluster, clusterId, tools, results, onChanged, toast]);

  return (
    <div className="mt-5 rounded-xl border border-forge-border bg-forge-panel/40">
      <div className="flex items-center gap-2 border-b border-forge-border px-3 py-2">
        <Sparkles size={14} className="text-forge-ember" />
        <span className="text-xs font-medium text-forge-ink">Ask this studio</span>
        <span className="ml-auto text-[10px] text-forge-dim">creates & revises here · sends nothing without approval</span>
      </div>

      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-64 overflow-auto px-3 py-2 space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-lg px-3 py-1.5 text-xs',
                m.role === 'user' ? 'bg-forge-ember/15 text-forge-ink' : 'bg-forge-raised text-forge-dim',
              )}>
                {m.decision?.kind === 'propose_approval' && (
                  <Link to="/garvis/queue" className="mb-1 flex items-center gap-1 text-forge-warn"><ShieldCheck size={11} /> waiting in the Queue</Link>
                )}
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div className="flex items-center gap-1.5 text-xs text-forge-dim"><Loader2 size={12} className="animate-spin" /> thinking…</div>}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={`e.g. "make the copy more luxury" · "queue touch 1 to the lakefront list"`}
          disabled={busy}
          className="flex-1 rounded-lg border border-forge-border bg-forge-panel px-3 py-2 text-sm text-forge-ink placeholder:text-forge-dim/60 disabled:opacity-50"
        />
        <Button variant='primary' size='md' onClick={() => void send()} disabled={busy || !input.trim()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </Button>
      </div>
    </div>
  );
}
